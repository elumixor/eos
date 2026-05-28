import { createGateway } from "@ai-sdk/gateway";
import { streamText } from "ai";
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

const tailSchema = z.object({
  transcript: z.string(),
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

  // We stream raw text so the user-facing reply appears token-by-token,
  // then a marker, then JSON for transcript + actions. Structured output
  // with Output.object buffered the whole reply, killing the live feel.
  const systemPrompt = `You are the assistant for PureType, a daily to-do app.
Listen to the attached audio and respond in this EXACT format:

<one short reply sentence to the user, in the SAME language they spoke>
<<<ACTIONS>>>
{"transcript": "<exact transcription>", "actions": [{ "op": "...", "id"?: "...", "text"?: "..." }]}

Ops: create (needs text), complete/uncomplete/delete (needs existing id),
edit (needs existing id + new text). Only reference tasks by the exact ids
below. New tasks default to "today". A single utterance can map to multiple
actions. The reply sentence must never be empty.

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
  });

  const MARKER = "<<<ACTIONS>>>";
  let buffer = "";
  let messageEmitted = 0;
  let markerSeen = false;

  for await (const chunk of stream.textStream) {
    buffer += chunk;
    if (markerSeen) continue;
    const idx = buffer.indexOf(MARKER);
    if (idx >= 0) {
      // Emit the rest of the message text up to the marker, then stop.
      if (idx > messageEmitted) {
        yield { type: "message" as const, text: buffer.slice(messageEmitted, idx) };
      }
      messageEmitted = idx;
      markerSeen = true;
      continue;
    }
    // Hold back the tail in case the marker is being assembled across chunks.
    const safe = Math.max(0, buffer.length - MARKER.length);
    if (safe > messageEmitted) {
      yield { type: "message" as const, text: buffer.slice(messageEmitted, safe) };
      messageEmitted = safe;
    }
  }

  const markerIdx = buffer.indexOf(MARKER);
  const messageText = (markerIdx >= 0 ? buffer.slice(0, markerIdx) : buffer).trim();
  const tailRaw = markerIdx >= 0 ? buffer.slice(markerIdx + MARKER.length).trim() : "";
  // Strip an accidental ```json fence if the model adds one.
  const tailJson = tailRaw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let transcript = "";
  let actions: z.infer<typeof actionSchema>[] = [];
  if (tailJson) {
    try {
      const parsed = tailSchema.safeParse(JSON.parse(tailJson));
      if (parsed.success) {
        transcript = parsed.data.transcript;
        actions = parsed.data.actions;
      }
    } catch {
      // Bad JSON from the model — fall through with no actions. The user
      // still sees the reply text we streamed.
    }
  }
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
    transcription: transcript,
    message: messageText,
  };
});
