import { createGateway } from "@ai-sdk/gateway";
import { Output, streamText } from "ai";
import { env } from "env";
import { readFormData } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Vercel AI Gateway. Lets us address any provider/model via a single key
// and get streaming + cross-provider format normalization for free.
const gateway = createGateway({ apiKey: env.VERCEL_AI_KEY });

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
  transcript: z.string(),
  message: z.string(),
  actions: z.array(actionSchema),
});

// Gemini-friendly media types. Browser MediaRecorder usually gives us mp4
// on iOS/Safari and webm/opus on Chrome; we relabel webm as ogg since they
// both carry opus and Gemini accepts ogg/opus.
function mediaTypeFor(file: File): string {
  const t = file.type.toLowerCase();
  if (t.startsWith("audio/mp4") || t.includes("aac")) return "audio/aac";
  if (t.startsWith("audio/mpeg")) return "audio/mp3";
  if (t.startsWith("audio/wav") || t.startsWith("audio/wave")) return "audio/wav";
  if (t.startsWith("audio/flac")) return "audio/flac";
  if (t.startsWith("audio/webm") || t.startsWith("audio/ogg")) return "audio/ogg";
  return "audio/ogg";
}

const historySchema = z.array(z.object({ transcript: z.string(), message: z.string() }));

export default handler(async function* ({ user, event }) {
  requireAuth(user);
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;
  if (!audioFile) throw new Error("No audio file provided");

  const bytes = new Uint8Array(await audioFile.arrayBuffer());
  const mediaType = mediaTypeFor(audioFile);

  // Prior turns from this conversation. Capped at 10 client-side; we still
  // defensively trim here so a misbehaving client can't blow up the prompt.
  const historyRaw = formData.get("history");
  const historyParsed =
    typeof historyRaw === "string" ? historySchema.safeParse(JSON.parse(historyRaw)) : null;
  const history = historyParsed?.success ? historyParsed.data.slice(-10) : [];

  const flat = await allTasks(user.id);
  const fmt = (t: { id: string; text: string; completed: boolean }) =>
    `- [${t.completed ? "x" : " "}] (id: ${t.id}) ${t.text}`;
  const context = (["today", "week", "later"] as const)
    .map((b) => {
      const lines =
        flat
          .filter((t) => t.bucket === b)
          .map(fmt)
          .join("\n") || "(none)";
      return `${b} tasks:\n${lines}`;
    })
    .join("\n\n");

  const systemPrompt = `You are the assistant for Eos, a daily to-do app.
The user spoke a command. Listen to the attached audio, decide what changes
to make to their task lists, and respond with a JSON object:

- "transcript": exact transcription of what the user said, in their language.
- "message": short reply (one sentence) in the SAME language the user spoke.
  Never empty. A confirmation, clarifying question, or brief acknowledgement.
- "actions": list of operations. Each: { op, id?, text? }. Ops:
    create  — needs text
    complete / uncomplete / delete — needs an existing id
    edit    — needs an existing id and new text

Rules:
- Only reference tasks by the exact id shown below.
- New tasks default to the "today" bucket.
- A single utterance can map to multiple actions.

Current state:
${context}`;

  // Replay prior turns as plain text so Gemini has context for follow-ups
  // like "no, the second one" or "actually call it 'tomorrow' instead".
  const priorMessages = history.flatMap((h) => [
    { role: "user" as const, content: h.transcript },
    { role: "assistant" as const, content: h.message },
  ]);

  const stream = streamText({
    model: gateway("google/gemini-2.5-flash"),
    system: systemPrompt,
    messages: [
      ...priorMessages,
      {
        role: "user",
        content: [
          { type: "text", text: "Voice command attached." },
          { type: "file", data: bytes, mediaType },
        ],
      },
    ],
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
    ? ((
        await prisma.task.aggregate({
          where: { userId: user.id, bucket: "today" },
          _max: { order: true },
        })
      )._max.order ?? -1)
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
      if (a.op === "complete") return prisma.task.update({ where: { id: a.id }, data: { completed: true } });
      if (a.op === "uncomplete") return prisma.task.update({ where: { id: a.id }, data: { completed: false } });
      if (a.op === "edit" && a.text?.trim())
        return prisma.task.update({ where: { id: a.id }, data: { text: a.text.trim() } });
      if (a.op === "delete") return prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      return Promise.resolve();
    }),
  ]);

  return {
    transcription: final.transcript ?? "",
    message: final.message ?? "",
    tasks: await allTasks(user.id),
  };
});
