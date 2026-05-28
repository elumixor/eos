import { createGateway } from "@ai-sdk/gateway";
import { parsePartialJson, streamText } from "ai";
import { env } from "env";
import { readFormData } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Vercel AI Gateway. Lets us address any provider/model via a single key
// and get streaming + cross-provider format normalization for free.
const gateway = createGateway({ apiKey: env.VERCEL_AI_KEY });

const actionSchema = z.object({
  op: z.literal("create"),
  text: z.string(),
});

// Field order matters: the model writes JSON top-to-bottom, so `reply`
// being first means we can stream it out incrementally before transcript
// + actions are even generated.
const recordSchema = z.object({
  reply: z
    .string()
    .describe("Short one-sentence reply to the user, in the SAME language they spoke. Never empty."),
  transcript: z.string().describe("Exact transcription of what the user said, in their language."),
  actions: z.array(actionSchema).describe("Tasks to create. Empty if the user asked nothing actionable."),
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

  // Gemini with toolChoice="required" doesn't emit any preamble text, so
  // we put the reply inside the tool input and stream it out of the JSON
  // as it's being generated.
  const systemPrompt = `You are the assistant for PureType, a daily to-do app.
Listen to the attached audio and call the "record" tool. The "reply" field
must be a short one-sentence reply to the user in the SAME language they
spoke, never empty. New tasks default to today's list.`;

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
    tools: {
      record: {
        description: "Record the transcript and the list of tasks to create.",
        inputSchema: recordSchema,
      },
    },
    toolChoice: "required",
  });

  let toolInput: z.infer<typeof recordSchema> | null = null;
  let inputBuffer = "";
  let replyEmitted = "";

  for await (const part of stream.fullStream) {
    if (part.type === "tool-input-delta") {
      inputBuffer += part.delta;
      const parsed = await parsePartialJson(inputBuffer);
      const obj = parsed.value;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const reply = (obj as Record<string, unknown>).reply;
        if (typeof reply === "string" && reply.length > replyEmitted.length) {
          yield { type: "message" as const, text: reply.slice(replyEmitted.length) };
          replyEmitted = reply;
        }
      }
    } else if (part.type === "tool-call" && part.toolName === "record") {
      const parsed = recordSchema.safeParse(part.input);
      if (parsed.success) toolInput = parsed.data;
    }
  }

  const actions = toolInput?.actions ?? [];
  const transcript = toolInput?.transcript ?? "";
  const messageText = toolInput?.reply ?? replyEmitted;

  const creates = actions.flatMap((a) => {
    const text = a.text.trim();
    return text ? [{ text }] : [];
  });

  if (creates.length) {
    const maxOrder =
      (
        await prisma.task.aggregate({
          where: { userId: user.id, bucket: "today" },
          _max: { order: true },
        })
      )._max.order ?? -1;
    await Promise.all(
      creates.map((a, i) =>
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
    );
  }

  return {
    transcription: transcript,
    message: messageText.trim(),
  };
});
