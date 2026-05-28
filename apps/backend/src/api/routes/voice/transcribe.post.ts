import { createGateway } from "@ai-sdk/gateway";
import { parsePartialJson, stepCountIs, streamText } from "ai";
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
  op: z.enum(["create", "complete", "uncomplete", "edit", "delete"]),
  id: z.string().optional(),
  text: z.string().optional(),
});
type Action = z.infer<typeof actionSchema>;

// Field order matters — JSON is generated top-to-bottom, so `reply` arrives
// before `transcript` and `actions`. We pluck each field out of the partial
// JSON stream as it lands, instead of waiting for the whole tool call.
const recordSchema = z.object({
  reply: z
    .string()
    .describe("Short one-sentence reply to the user, in the SAME language they spoke. Never empty."),
  transcript: z.string().describe("Exact transcription of what the user said, in their language."),
  actions: z
    .array(actionSchema)
    .describe(
      "Operations to apply. create needs text; complete/uncomplete/delete need id; edit needs id + text.",
    ),
});

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
  const userId = user.id;
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;
  if (!audioFile) throw new Error("No audio file provided");

  const bytes = new Uint8Array(await audioFile.arrayBuffer());
  const mediaType = mediaTypeFor(audioFile);

  const historyRaw = formData.get("history");
  const historyParsed =
    typeof historyRaw === "string" ? historySchema.safeParse(JSON.parse(historyRaw)) : null;
  const history = historyParsed?.success ? historyParsed.data.slice(-10) : [];

  // Cached during the request so multiple `create`s pack consecutive orders
  // without N+1 aggregate queries.
  let todayMaxOrder: number | null = null;
  async function nextTodayOrder() {
    if (todayMaxOrder === null) {
      todayMaxOrder =
        (
          await prisma.task.aggregate({
            where: { userId: userId, bucket: "today" },
            _max: { order: true },
          })
        )._max.order ?? -1;
    }
    todayMaxOrder += 1;
    return todayMaxOrder;
  }

  async function applyAction(a: Action) {
    if (a.op === "create") {
      const text = a.text?.trim();
      if (!text) return null;
      return prisma.task.create({
        data: {
          userId: userId,
          text,
          bucket: "today",
          scheduledAt: new Date(),
          order: await nextTodayOrder(),
        },
      });
    }
    if (!a.id) return null;
    if (a.op === "complete")
      return prisma.task.update({ where: { id: a.id }, data: { completed: true } });
    if (a.op === "uncomplete")
      return prisma.task.update({ where: { id: a.id }, data: { completed: false } });
    if (a.op === "edit") {
      const text = a.text?.trim();
      if (!text) return null;
      return prisma.task.update({ where: { id: a.id }, data: { text } });
    }
    if (a.op === "delete")
      return prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    return null;
  }

  const systemPrompt = `You are the assistant for PureType, a daily to-do app.
Listen to the attached audio. If you need to know what tasks already exist
(e.g. to complete or edit one), call the "findTasks" tool first. When ready,
call the "record" tool exactly once with:
  - reply: short one-sentence reply in the user's language, never empty
  - transcript: exact transcription of what the user said
  - actions: list of operations. create needs text; complete/uncomplete/
    delete need id; edit needs id + new text. New tasks default to today.`;

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
      findTasks: {
        description:
          "Search the user's tasks by substring and/or bucket. Returns up to 30 matches.",
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe("Case-insensitive substring to match against task text."),
          bucket: z.enum(["today", "week", "later"]).optional(),
          completed: z.boolean().optional(),
        }),
        execute: async ({ query, bucket, completed }) => {
          const found = await prisma.task.findMany({
            where: {
              userId: userId,
              deletedAt: null,
              ...(bucket ? { bucket } : {}),
              ...(completed !== undefined ? { completed } : {}),
              ...(query ? { text: { contains: query } } : {}),
            },
            select: { id: true, text: true, bucket: true, completed: true },
            orderBy: [{ bucket: "asc" }, { order: "asc" }],
            take: 30,
          });
          return found;
        },
      },
      record: {
        description: "Record the reply, transcript, and list of actions to apply.",
        inputSchema: recordSchema,
      },
    },
    toolChoice: "auto",
    // Allow a couple of findTasks calls before the final record.
    stopWhen: stepCountIs(4),
  });

  let activeToolName: string | null = null;
  let inputBuffer = "";
  let replyEmitted = "";
  let transcriptEmitted = false;
  let actionsApplied = 0;
  let toolInput: z.infer<typeof recordSchema> | null = null;

  async function flushReady(o: Record<string, unknown>, finalised: boolean) {
    // Reply: stream new tail as it grows.
    const reply = o.reply;
    if (typeof reply === "string" && reply.length > replyEmitted.length) {
      yieldQueue.push({ type: "message" as const, text: reply.slice(replyEmitted.length) });
      replyEmitted = reply;
    }
    // Transcript: emit as soon as we know its string is closed. Heuristic:
    // either parse is finalised, or the next field (`actions`) has appeared.
    if (!transcriptEmitted) {
      const transcript = o.transcript;
      const transcriptClosed = finalised || "actions" in o;
      if (typeof transcript === "string" && transcriptClosed) {
        yieldQueue.push({ type: "transcript" as const, text: transcript });
        transcriptEmitted = true;
      }
    }
    // Actions: anything before the last index is committed (the next element
    // appearing means the previous one closed). On the final parse, all are.
    const arr = o.actions;
    if (Array.isArray(arr)) {
      const ready = finalised ? arr.length : arr.length - 1;
      while (actionsApplied < ready) {
        const candidate = arr[actionsApplied++];
        const validated = actionSchema.safeParse(candidate);
        if (!validated.success) continue;
        const result = await applyAction(validated.data);
        if (!result) continue;
        yieldQueue.push({ type: "action" as const, task: result });
      }
    }
  }

  // We can't `yield` from inside `flushReady` because it's awaited as a
  // helper, so it buffers events and the outer loop drains them.
  const yieldQueue: (
    | { type: "message"; text: string }
    | { type: "transcript"; text: string }
    | { type: "action"; task: unknown }
  )[] = [];

  for await (const part of stream.fullStream) {
    if (part.type === "tool-input-start") {
      activeToolName = part.toolName;
      inputBuffer = "";
    } else if (part.type === "tool-input-end") {
      activeToolName = null;
    } else if (part.type === "tool-input-delta") {
      if (activeToolName !== "record") continue;
      inputBuffer += part.delta;
      const parsed = await parsePartialJson(inputBuffer);
      const obj = parsed.value;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        await flushReady(obj as Record<string, unknown>, parsed.state === "successful-parse");
      }
    } else if (part.type === "tool-call" && part.toolName === "record") {
      const parsed = recordSchema.safeParse(part.input);
      if (parsed.success) toolInput = parsed.data;
    }
    while (yieldQueue.length) yield yieldQueue.shift()!;
  }

  // Final reconciliation in case the streaming pass missed any boundaries.
  if (toolInput) {
    await flushReady(toolInput as unknown as Record<string, unknown>, true);
    while (yieldQueue.length) yield yieldQueue.shift()!;
  }

  return {
    transcription: toolInput?.transcript ?? "",
    message: (toolInput?.reply ?? replyEmitted).trim(),
  };
});
