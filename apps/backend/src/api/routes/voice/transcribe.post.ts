import { createGateway } from "@ai-sdk/gateway";
import { parsePartialJson, stepCountIs, streamText } from "ai";
import { env } from "env";
import { readFormData } from "h3";
import { trackEvent } from "services/analytics";
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
  bucket: z.enum(["today", "week", "later"]).optional(),
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
      "Operations to apply. create: needs text. complete/uncomplete/delete: need id. edit: needs id and (text and/or bucket).",
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

// Read-only SQL guard. query() wraps user-supplied SQL in a CTE that shadows
// the `Task` name with a userId-scoped, alive-only view, so any reference to
// Task inside the query is automatically tenant-isolated. Writes / pragmas
// are rejected outright so the CTE shadow can't be bypassed.
const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|attach|detach|pragma|create|replace|truncate)\b/i;
function isReadOnlySql(sql: string) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return false;
  if (trimmed.includes(";")) return false;
  if (FORBIDDEN_SQL.test(trimmed)) return false;
  return /^\s*(select|with)\b/i.test(trimmed);
}

// SQLite returns COUNT()/SUM() as BigInt and DATETIME columns as Date —
// neither survives JSON.stringify, so we'd silently break the tool result
// shipped back to the model. Recursively normalise.
function normaliseValue(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normaliseValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = normaliseValue(val);
    return out;
  }
  return v;
}
function normaliseRows(rows: unknown[]): unknown[] {
  return rows.map(normaliseValue);
}

export default handler(async function* ({ user, event }) {
  requireAuth(user);
  const userId = user.id;
  const startedAt = Date.now();
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;
  if (!audioFile) {
    trackEvent("voice_failed", userId, { reason: "no_audio" });
    throw new Error("No audio file provided");
  }

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
      return prisma.task.update({
        where: { id: a.id },
        data: { completed: true, completedAt: new Date() },
      });
    if (a.op === "uncomplete")
      return prisma.task.update({
        where: { id: a.id },
        data: { completed: false, completedAt: null },
      });
    if (a.op === "edit") {
      const data: { text?: string; bucket?: string; scheduledAt?: Date | null } = {};
      const text = a.text?.trim();
      if (text) data.text = text;
      if (a.bucket) {
        data.bucket = a.bucket;
        // Bucket change re-stamps scheduledAt: today/week get "now" so the
        // task isn't immediately treated as overdue; later clears it.
        data.scheduledAt = a.bucket === "later" ? null : new Date();
      }
      if (!Object.keys(data).length) return null;
      return prisma.task.update({ where: { id: a.id }, data });
    }
    if (a.op === "delete")
      return prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = `You are the assistant for PureType, a daily to-do app.

Today is ${today} (UTC).

You have two tools:

1) query({ sql }) — read-only SELECT against the user's data. The Task table
   is automatically scoped to the current user and excludes deleted rows.
   Schema:
     Task(
       id          TEXT,
       text        TEXT,
       completed   INTEGER  -- 0 | 1
       completedAt DATETIME,
       bucket      TEXT     -- 'today' | 'week' | 'later'
       "order"     INTEGER,
       scheduledAt DATETIME,
       projectId   TEXT,
       startTime   DATETIME,
       duration    INTEGER  -- minutes
       createdAt   DATETIME,
       updatedAt   DATETIME
     )
   Use DATE(col) for day comparisons. Cap broad scans with LIMIT 30.
   Quote "order" because it's a reserved word.

2) record({ reply, transcript, actions }) — terminal call, exactly once.
     reply       — one short sentence in the user's language. Never empty.
     transcript  — exact transcription.
     actions     — list of mutations to apply:
       { op: 'create',     text }
       { op: 'complete',   id }
       { op: 'uncomplete', id }
       { op: 'edit',       id, text?, bucket? }   // bucket moves between lists
       { op: 'delete',     id }
     New tasks default to today's list. A single utterance can map to many actions.

Listen to the audio, call query() if you need ids or counts, then ALWAYS call
record() to finish — even for purely informational questions (use the answer
as the reply and leave actions empty).`;

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
      query: {
        description:
          "Run a read-only SQL SELECT against the user's data. The Task table is auto-scoped to the current user and excludes deleted rows. Use DATE() for day comparisons.",
        inputSchema: z.object({
          sql: z
            .string()
            .describe(
              "A single SELECT (or WITH … SELECT) statement. No semicolons, no writes, no PRAGMA.",
            ),
        }),
        execute: async ({ sql }) => {
          if (!isReadOnlySql(sql)) {
            console.warn("[voice.query] rejected non-readonly sql", { userId, sql });
            return {
              error:
                "Rejected: only a single SELECT or WITH…SELECT is allowed. No semicolons or write keywords.",
              rejectedSql: sql,
            };
          }
          const escapedUserId = userId.replace(/'/g, "''");
          const scoped = `WITH "Task" AS (SELECT * FROM "Task" WHERE "userId" = '${escapedUserId}' AND "deletedAt" IS NULL) ${sql.trim().replace(/;+\s*$/, "")} LIMIT 100`;
          const t0 = Date.now();
          try {
            const rows = await prisma.$queryRawUnsafe<unknown[]>(scoped);
            const normalised = normaliseRows(rows);
            console.info("[voice.query] ok", {
              userId,
              ms: Date.now() - t0,
              rowCount: normalised.length,
              sql,
            });
            return { rows: normalised, rowCount: normalised.length };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[voice.query] failed", {
              userId,
              ms: Date.now() - t0,
              sql,
              scoped,
              error: message,
              stack: err instanceof Error ? err.stack : undefined,
            });
            // Return the actual error to the model so it can adjust its
            // query (e.g. fix a typo'd column) instead of giving up.
            return { error: message, attemptedSql: sql };
          }
        },
      },
      record: {
        description: "Record the reply, transcript, and list of actions to apply.",
        inputSchema: recordSchema,
      },
    },
    // "required" forces a tool call on every step — otherwise Gemini will
    // happily answer informational questions ("how many tasks?") with free
    // text and skip record() entirely, leaving us with an empty response.
    toolChoice: "required",
    // Generous step budget so a couple of query() calls can still be
    // followed by the terminal record().
    stopWhen: stepCountIs(6),
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
        if (!validated.success) {
          console.warn("[voice.action] skipped invalid action", {
            userId,
            index: actionsApplied - 1,
            candidate,
            issues: validated.error.issues,
          });
          continue;
        }
        try {
          const result = await applyAction(validated.data);
          if (!result) {
            console.warn("[voice.action] no-op (missing required field)", {
              userId,
              action: validated.data,
            });
            continue;
          }
          yieldQueue.push({ type: "action" as const, task: result });
        } catch (err) {
          console.error("[voice.action] apply failed", {
            userId,
            action: validated.data,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
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

  // Safety net: if the model ignores toolChoice="required" and emits plain
  // text (rare, but it has happened), surface it as the message rather than
  // returning an empty reply.
  let fallbackText = "";

  for await (const part of stream.fullStream) {
    if (part.type === "text-delta") {
      fallbackText += part.text;
      // Only stream the fallback if record() hasn't claimed the reply slot.
      if (replyEmitted === "") {
        yieldQueue.push({ type: "message" as const, text: part.text });
      }
    } else if (part.type === "tool-input-start") {
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
      if (parsed.success) {
        toolInput = parsed.data;
      } else {
        console.warn("[voice.record] tool-call input failed schema", {
          userId,
          input: part.input,
          issues: parsed.error.issues,
        });
      }
    } else if (part.type === "error") {
      console.error("[voice.stream] error part from model", {
        userId,
        error: part.error,
      });
    }
    while (yieldQueue.length) yield yieldQueue.shift()!;
  }

  // Final reconciliation in case the streaming pass missed any boundaries.
  if (toolInput) {
    await flushReady(toolInput as unknown as Record<string, unknown>, true);
    while (yieldQueue.length) yield yieldQueue.shift()!;
  }

  const durationMs = Date.now() - startedAt;
  const finalMessage = (toolInput?.reply ?? replyEmitted ?? fallbackText).trim();
  const finalTranscript = toolInput?.transcript ?? "";

  console.info("[voice] turn done", {
    userId,
    durationMs,
    audioBytes: bytes.byteLength,
    mediaType,
    historyTurns: history.length,
    recordCalled: Boolean(toolInput),
    actionsApplied,
    messageSource: toolInput?.reply
      ? "tool-input"
      : replyEmitted
        ? "stream-buffer"
        : fallbackText
          ? "text-delta-fallback"
          : "empty",
    messageLen: finalMessage.length,
    transcriptLen: finalTranscript.length,
  });
  if (!finalMessage) {
    console.warn("[voice] empty message returned", {
      userId,
      toolInputSeen: Boolean(toolInput),
      replyEmittedLen: replyEmitted.length,
      fallbackLen: fallbackText.length,
    });
  }

  trackEvent("voice_used", userId, {
    durationMs,
    audioBytes: bytes.byteLength,
    actionsApplied,
    hadTranscript: Boolean(finalTranscript),
    recordCalled: Boolean(toolInput),
  });

  return {
    transcription: finalTranscript,
    message: finalMessage,
  };
});
