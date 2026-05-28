import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { env } from "env";
import { readFormData } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

const OPENAI_API = "https://api.openai.com/v1";

// Route the chat call through Vercel AI Gateway — same OpenAI-compatible
// surface, but with the gateway's observability and provider failover.
const gateway = createOpenAI({
  apiKey: env.VERCEL_AI_KEY,
  baseURL: "https://ai-gateway.vercel.sh/v1",
});

function allTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ bucket: "asc" }, { order: "asc" }],
  });
}

const actionSchema = z.object({
  op: z.enum(["create", "complete", "uncomplete", "edit", "delete"]),
  id: z.string().optional(),
  text: z.string().optional(),
});

const replySchema = z.object({
  message: z.string(),
  actions: z.array(actionSchema),
});

export default handler(async function* ({ user, event }) {
  requireAuth(user);
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;
  if (!audioFile) throw new Error("No audio file provided");

  // 1. Transcribe. gpt-4o-mini-transcribe is faster than whisper-1 and still
  //    multilingual; it doesn't expose a language field, so we ask the chat
  //    model to mirror the spoken language directly.
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile);
  whisperForm.append("model", "gpt-4o-mini-transcribe");
  whisperForm.append("response_format", "json");

  const transcriptionRes = await fetch(`${OPENAI_API}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: whisperForm,
  });
  const transcription = (await transcriptionRes.json()) as { text?: string };
  const spoken = (transcription.text ?? "").trim();

  if (!spoken) return { transcription: "", message: "", tasks: await allTasks(user.id) };

  yield { type: "transcript" as const, text: spoken };

  // 2. Stream the structured reply. `partialOutputStream` parses incomplete
  //    JSON for us, so we can emit `message` deltas as they arrive.
  const flat = await allTasks(user.id);
  const fmt = (t: { id: string; text: string; completed: boolean }) =>
    `- [${t.completed ? "x" : " "}] (id: ${t.id}) ${t.text}`;
  const context = (["today", "week", "later"] as const)
    .map((b) => {
      const lines = flat.filter((t) => t.bucket === b).map(fmt).join("\n") || "(none)";
      return `${b} tasks:\n${lines}`;
    })
    .join("\n\n");

  const systemPrompt = `You are the assistant for Eos, a daily to-do app.
The user gave a voice command (transcribed in their own language).
Decide what changes to make to their task lists.

Output a JSON object with TWO fields:
- "message": short reply (one sentence) in the SAME language the user spoke.
  Never empty. A confirmation, clarifying question, or brief acknowledgement.
- "actions": list of operations. Each: { op, id?, text? }. Ops:
    create  — needs text
    complete / uncomplete / delete — needs existing id
    edit    — needs existing id and new text

Rules:
- Only reference tasks by the exact id shown below.
- New tasks default to the "today" bucket.
- A single utterance can map to multiple actions.

Current state:
${context}`;

  const stream = streamText({
    model: gateway("openai/gpt-5.4-mini"),
    system: systemPrompt,
    prompt: spoken,
    output: Output.object({ schema: replySchema }),
  });

  let emitted = 0;
  for await (const partial of stream.partialOutputStream) {
    const msg = partial.message ?? "";
    if (msg.length > emitted) {
      yield { type: "message" as const, text: msg.slice(emitted) };
      emitted = msg.length;
    }
  }

  const final = await stream.output;
  const actions = final.actions ?? [];
  const validIds = new Set(flat.map((t) => t.id));

  // 3. Apply actions. Batch creates with a single max-order lookup; run
  //    everything in parallel.
  const creates = actions.flatMap((a) => {
    if (a.op !== "create") return [];
    const text = a.text?.trim();
    return text ? [{ text }] : [];
  });
  const others = actions.flatMap((a) => {
    if (a.op === "create" || !a.id || !validIds.has(a.id)) return [];
    return [{ ...a, id: a.id }];
  });

  const maxOrder = creates.length
    ? (
        await prisma.task.aggregate({
          where: { userId: user.id, bucket: "today" },
          _max: { order: true },
        })
      )._max.order ?? -1
    : -1;

  await Promise.all([
    ...creates.map((a, i) =>
      prisma.task.create({
        data: {
          userId: user.id,
          text: a.text,
          bucket: "today",
          scheduledAt: new Date(),
          order: maxOrder + 1 + i,
        },
      }),
    ),
    ...others.map((a) => {
      if (a.op === "complete")
        return prisma.task.update({ where: { id: a.id }, data: { completed: true } });
      if (a.op === "uncomplete")
        return prisma.task.update({ where: { id: a.id }, data: { completed: false } });
      if (a.op === "edit" && a.text?.trim())
        return prisma.task.update({ where: { id: a.id }, data: { text: a.text.trim() } });
      if (a.op === "delete")
        return prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      return Promise.resolve();
    }),
  ]);

  return {
    transcription: spoken,
    message: final.message ?? "",
    tasks: await allTasks(user.id),
  };
});
