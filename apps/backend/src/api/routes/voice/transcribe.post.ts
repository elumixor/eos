import { env } from "env";
import { readFormData } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

const OPENAI_API = "https://api.openai.com/v1";

function allTasks(userId: string) {
  return prisma.task.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ bucket: "asc" }, { order: "asc" }],
  });
}

interface Action {
  op: "create" | "complete" | "uncomplete" | "delete" | "edit";
  id?: string;
  text?: string;
}

export default handler(async ({ user, event }) => {
  requireAuth(user);
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;

  if (!audioFile) {
    throw new Error("No audio file provided");
  }

  // 1. Transcribe with Whisper. It auto-detects the spoken language, so any
  //    language works without configuration.
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile);
  whisperForm.append("model", "whisper-1");
  // verbose_json returns the detected language so we can pin the reply to it,
  // instead of letting the chat model infer language from the (possibly
  // mixed-language) task list.
  whisperForm.append("response_format", "verbose_json");

  const transcriptionRes = await fetch(`${OPENAI_API}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: whisperForm,
  });
  const transcription = (await transcriptionRes.json()) as {
    text?: string;
    language?: string;
  };
  const spoken = (transcription.text ?? "").trim();
  const language = transcription.language?.trim() || "the language the user spoke";

  if (!spoken) {
    return { transcription: "", message: null, tasks: await allTasks(user.id) };
  }

  // 2. Give the model the current task lists (with ids) so it can act on
  //    them, then ask it for a list of mutations to apply.
  const flat = await allTasks(user.id);
  const todayTasks = flat.filter((t) => t.bucket === "today");
  const weekTasks = flat.filter((t) => t.bucket === "week");
  const laterTasks = flat.filter((t) => t.bucket === "later");

  const fmt = (t: { id: string; text: string; completed: boolean }) =>
    `- [${t.completed ? "x" : " "}] (id: ${t.id}) ${t.text}`;

  const context = [
    `Today's tasks:\n${todayTasks.map(fmt).join("\n") || "(none)"}`,
    `This week's tasks:\n${weekTasks.map(fmt).join("\n") || "(none)"}`,
    `Later tasks:\n${laterTasks.map(fmt).join("\n") || "(none)"}`,
  ].join("\n\n");

  const systemPrompt = `You are the assistant for Eos, a daily to-do app.
The user gave a voice command (transcribed below, in their own language).
Decide what changes to make to their task lists and respond with JSON only:

{
  "actions": [
    { "op": "create", "text": "string" },
    { "op": "complete", "id": "existing task id" },
    { "op": "uncomplete", "id": "existing task id" },
    { "op": "edit", "id": "existing task id", "text": "new text" },
    { "op": "delete", "id": "existing task id" }
  ],
  "message": "string or null"
}

Rules:
- Only reference existing tasks by the exact id shown in the context.
- New tasks default to the "today" bucket. The user has no concept of a
  specific date anymore — only the three buckets today/week/later.
- A single utterance can map to multiple actions (e.g. add three tasks).
- If the request is ambiguous or you cannot map it to any action, return
  "actions": [] and put a short clarifying question in "message".
- The user spoke ${language}. "message" MUST be written in ${language},
  regardless of what language the existing task texts are in. Use it for
  clarifying questions, or a brief confirmation, or null if actions speak
  for themselves.

Current state:
${context}`;

  const completionRes = await fetch(`${OPENAI_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: spoken },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const completion = (await completionRes.json()) as {
    choices?: { message: { content: string } }[];
  };

  let parsed: { actions?: Action[]; message?: string | null } = {};
  try {
    parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const validIds = new Set(flat.map((t) => t.id));

  // 3. Apply the actions. Unknown ids are skipped defensively so a model
  //    hallucination can't blow up the request.
  for (const a of actions) {
    if (a.op === "create" && a.text?.trim()) {
      const maxOrder = await prisma.task.aggregate({
        where: { userId: user.id, bucket: "today" },
        _max: { order: true },
      });
      await prisma.task.create({
        data: {
          userId: user.id,
          text: a.text.trim(),
          bucket: "today",
          scheduledAt: new Date(),
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
    } else if (a.id && validIds.has(a.id)) {
      if (a.op === "complete") {
        await prisma.task.update({ where: { id: a.id }, data: { completed: true } });
      } else if (a.op === "uncomplete") {
        await prisma.task.update({ where: { id: a.id }, data: { completed: false } });
      } else if (a.op === "edit" && a.text?.trim()) {
        await prisma.task.update({ where: { id: a.id }, data: { text: a.text.trim() } });
      } else if (a.op === "delete") {
        await prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      }
    }
  }

  const message = typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : null;

  return { transcription: spoken, message, tasks: await allTasks(user.id) };
});
