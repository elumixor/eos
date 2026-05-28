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

// Terminal tool — model calls it once at the very end. Reply text streams
// token-by-token because it's the first field, and by the time the model
// writes it, any apply() results from earlier steps are already in context.
const recordSchema = z.object({
  reply: z
    .string()
    .describe(
      "Short one-sentence reply to the user in their language. Never empty. If the user asked you to show / list / find tasks, put their ids in taskRefs and keep the reply itself short (e.g. 'Here's your list:'). Do NOT enumerate tasks as numbered text — the UI renders taskRefs as proper task chips. If a previous apply() returned any failed results, SAY SO truthfully — do not claim success.",
    ),
  transcript: z.string().describe("Exact transcription of what the user said, in their language."),
  taskRefs: z
    .array(z.string())
    .optional()
    .describe(
      "Ids of existing tasks to show under the reply. Use whenever the user asked to see, list, find, or review tasks. Order matters. Cap at 30.",
    ),
});

// Mutation tool — runs each action server-side and returns per-action
// results so the model knows whether to claim success in the reply.
const applySchema = z.object({
  actions: z
    .array(actionSchema)
    .describe(
      "Operations to apply, in order. create: needs text. complete/uncomplete/delete: need an EXACT id string from a prior query() result. edit: needs id and (text and/or bucket).",
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

// Read-only SQL guard. query() wraps user-supplied SQL in a CTE named
// `tasks` that resolves to the current user's alive rows. We can't reuse
// the real table name `Task` here — SQLite rejects that as a circular
// reference. The model is told to SELECT FROM `tasks`, never from `Task`.
// Writes / pragmas / refs to the real Task table are rejected outright.
const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|attach|detach|pragma|create|replace|truncate)\b/i;
// Guard against the model bypassing tenant scoping by going straight to the
// real Task table (any quoting / case combination).
const RAW_TASK_REF = /\b(?:from|join)\s+("|`|\[)?task\1?\b/i;
function isReadOnlySql(sql: string) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return false;
  if (trimmed.includes(";")) return false;
  if (FORBIDDEN_SQL.test(trimmed)) return false;
  if (RAW_TASK_REF.test(trimmed)) return false;
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

  // Client-supplied "today" (YYYY-MM-DD, user's local calendar) and tz offset
  // in minutes (Date.prototype.getTimezoneOffset()'s sign — minutes that UTC
  // is ahead of local). Fall back to UTC if missing.
  const rawClientDate = formData.get("clientDate");
  const clientDate =
    typeof rawClientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawClientDate)
      ? rawClientDate
      : new Date().toISOString().slice(0, 10);
  const rawTz = formData.get("clientTzOffsetMin");
  const tzOffsetMin = typeof rawTz === "string" && /^-?\d+$/.test(rawTz) ? parseInt(rawTz, 10) : 0;
  // SQL modifier that shifts a UTC datetime to the user's local time. With
  // getTimezoneOffset() = -120 (UTC+2), we want to ADD 120 minutes.
  const localShift = `${-tzOffsetMin} minutes`;

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

  const systemPrompt = `You are the assistant for PureType, a daily to-do app.

Today (in the user's local timezone) is ${clientDate}.
Use DATE('${clientDate}') for today, DATE('${clientDate}', '-1 day') for
yesterday, etc. Never use DATE('now') — the server is UTC and will be off.

You have two tools:

1) query({ sql }) — read-only SELECT against the user's data.
   ALWAYS query the \`tasks\` view (never \`Task\` directly — that's blocked).
   \`tasks\` is auto-scoped to the current user and excludes deleted rows.
   Columns (scheduledDate / completedDate are already in the user's local tz):
     tasks(
       id             TEXT,
       text           TEXT,
       completed      INTEGER   -- 0 | 1
       completedAt    DATETIME, -- UTC
       completedDate  TEXT      -- local YYYY-MM-DD (or NULL)
       bucket         TEXT      -- 'today' | 'week' | 'later' (stored bucket)
       "order"        INTEGER,  -- quote because it's a reserved word
       scheduledAt    DATETIME, -- UTC
       scheduledDate  TEXT      -- local YYYY-MM-DD (or NULL)
       isOverdue      INTEGER   -- 1 if today/week task whose date has passed
       isArchived     INTEGER   -- 1 if completed AND (later OR was overdue)
       projectId      TEXT,
       startTime      DATETIME,
       duration       INTEGER,
       createdAt      DATETIME,
       updatedAt      DATETIME
     )

   IMPORTANT — match what the UI shows:
   • "today" list:    bucket='today' AND isOverdue=0 AND isArchived=0
   • "this week":     bucket='week'  AND isOverdue=0 AND isArchived=0
   • "later" list:    bucket='later' AND isArchived=0
   • "overdue":       isOverdue=1
   • "archive":       isArchived=1
   Filter \`isArchived = 0\` for any "active" list. For day comparisons,
   prefer \`scheduledDate\` / \`completedDate\` over DATE(scheduledAt) —
   they're already shifted into the user's timezone. Cap scans with LIMIT 30.

   Examples:
     -- how many active tasks for today
     SELECT COUNT(*) AS n FROM tasks WHERE bucket='today' AND isOverdue=0 AND isArchived=0;
     -- completed yesterday (local)
     SELECT COUNT(*) AS n FROM tasks
       WHERE completed=1 AND completedDate=DATE('${clientDate}','-1 day');

2) apply({ actions }) — mutation tool. Run this BEFORE record() whenever the
   user asked you to change something. It returns per-action results so you
   know what actually succeeded.
     Action shapes:
       { op: 'create',     text }                      // creates in today
       { op: 'complete',   id }
       { op: 'uncomplete', id }
       { op: 'edit',       id, text?, bucket? }        // bucket moves lists
       { op: 'delete',     id }
     CRITICAL — for any op that takes an \`id\`, that id MUST come verbatim
     from a query() result this turn. NEVER invent ids ('123', '456', etc).
     If you don't have ids, query() first.
     A single utterance can map to many actions in one apply() call.

3) record({ reply, transcript, taskRefs? }) — terminal call, exactly once.
     reply       — one short sentence in the user's language. Never empty.
                   Do NOT enumerate tasks in the reply — use taskRefs instead.
                   If apply() returned failed results, say so truthfully —
                   do NOT claim success.
     transcript  — exact transcription of what the user said.
     taskRefs    — ids of existing tasks to display under the reply. Use
                   whenever the user asked to see, list, find, or review
                   tasks. The UI renders these as proper task chips.

Flow: query() for ids/counts → apply() for mutations → record() to finish.
ALWAYS call record() at the end — even for informational questions (set
the answer as reply, no apply() needed).`;

  const priorMessages = history.flatMap((h) => [
    { role: "user" as const, content: h.transcript },
    { role: "assistant" as const, content: h.message },
  ]);

  // Declared up front because the apply() tool's execute pushes to them.
  const yieldQueue: (
    | { type: "message"; text: string }
    | { type: "transcript"; text: string }
    | { type: "task-refs"; ids: string[] }
    | { type: "action"; task: unknown }
    | { type: "error"; code: string; message: string; detail?: string }
  )[] = [];
  let actionsApplied = 0;

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
          const userSql = sql.trim().replace(/;+\s*$/, "");
          const hasLimit = /\blimit\b/i.test(userSql);
          // The CTE adds precomputed flags + local-tz date columns so the
          // model can match exactly what the frontend shows:
          //   scheduledDate / completedDate — DATE() of the stored UTC value
          //     shifted into the user's local tz
          //   isOverdue  = bucket in (today|week) AND scheduledDate < today
          //                AND not yet completed
          //   isArchived = completed AND (bucket=later OR was overdue) —
          //                these don't show up in active sections
          const scoped =
            `WITH tasks AS (` +
            `SELECT *, ` +
            `CASE WHEN scheduledAt IS NULL THEN NULL ` +
            `  ELSE DATE(datetime(scheduledAt, '${localShift}')) END AS scheduledDate, ` +
            `CASE WHEN completedAt IS NULL THEN NULL ` +
            `  ELSE DATE(datetime(completedAt, '${localShift}')) END AS completedDate, ` +
            `CASE WHEN bucket IN ('today','week') AND scheduledAt IS NOT NULL ` +
            `  AND DATE(datetime(scheduledAt, '${localShift}')) < DATE('${clientDate}') ` +
            `  AND completed = 0 THEN 1 ELSE 0 END AS isOverdue, ` +
            `CASE WHEN completed = 1 AND ( ` +
            `  bucket = 'later' OR ( ` +
            `    bucket IN ('today','week') AND scheduledAt IS NOT NULL ` +
            `    AND DATE(datetime(scheduledAt, '${localShift}')) < DATE('${clientDate}') ` +
            `  ) ` +
            `) THEN 1 ELSE 0 END AS isArchived ` +
            `FROM "Task" WHERE "userId" = '${escapedUserId}' AND "deletedAt" IS NULL` +
            `) ${userSql}${hasLimit ? "" : " LIMIT 100"}`;
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
      apply: {
        description:
          "Apply a list of mutations to the user's tasks. Returns per-action results — check them before writing the reply.",
        inputSchema: applySchema,
        execute: async ({ actions }) => {
          const results: {
            index: number;
            op: Action["op"];
            id?: string;
            status: "ok" | "failed" | "skipped";
            taskId?: string;
            error?: string;
          }[] = [];
          for (let i = 0; i < actions.length; i++) {
            const validated = actionSchema.safeParse(actions[i]);
            if (!validated.success) {
              const err = validated.error.issues.map((iss) => iss.message).join("; ");
              console.warn("[voice.apply] invalid action", {
                userId,
                index: i,
                candidate: actions[i],
                issues: validated.error.issues,
              });
              results.push({
                index: i,
                op: (actions[i] as { op?: Action["op"] })?.op ?? "create",
                status: "failed",
                error: `Invalid action: ${err}`,
              });
              continue;
            }
            const a = validated.data;
            try {
              const task = await applyAction(a);
              if (!task) {
                results.push({
                  index: i,
                  op: a.op,
                  id: a.id,
                  status: "skipped",
                  error: "missing required field (e.g. text for create / id for update)",
                });
                continue;
              }
              actionsApplied += 1;
              yieldQueue.push({ type: "action" as const, task });
              results.push({
                index: i,
                op: a.op,
                id: a.id,
                status: "ok",
                taskId: (task as { id: string }).id,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[voice.apply] failed", {
                userId,
                index: i,
                action: a,
                error: message,
              });
              // Hand the model a useful summary instead of the Prisma blob —
              // e.g. for an unknown id, it should re-query.
              const friendly = /No record was found/i.test(message)
                ? `Task id "${a.id}" not found (was it from a previous turn? re-run query()).`
                : message;
              results.push({
                index: i,
                op: a.op,
                id: a.id,
                status: "failed",
                error: friendly,
              });
            }
          }
          const okCount = results.filter((r) => r.status === "ok").length;
          const failedCount = results.filter((r) => r.status === "failed").length;
          console.info("[voice.apply] done", { userId, ok: okCount, failed: failedCount });
          return { results, okCount, failedCount };
        },
      },
      record: {
        description: "Record the reply, transcript, and (optional) task refs.",
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
  let taskRefsEmitted = false;
  let toolInput: z.infer<typeof recordSchema> | null = null;

  function flushReady(o: Record<string, unknown>, finalised: boolean) {
    // Reply: stream new tail as it grows.
    const reply = o.reply;
    if (typeof reply === "string" && reply.length > replyEmitted.length) {
      yieldQueue.push({ type: "message" as const, text: reply.slice(replyEmitted.length) });
      replyEmitted = reply;
    }
    // Transcript: emit once the next field (taskRefs) has appeared OR parse
    // is finalised — either signals the string closed.
    if (!transcriptEmitted) {
      const transcript = o.transcript;
      const transcriptClosed = finalised || "taskRefs" in o;
      if (typeof transcript === "string" && transcriptClosed) {
        yieldQueue.push({ type: "transcript" as const, text: transcript });
        transcriptEmitted = true;
      }
    }
    if (!taskRefsEmitted) {
      const refs = o.taskRefs;
      // The terminal record() has no later field; we only know taskRefs is
      // closed once the whole parse finalises.
      if (finalised) {
        if (Array.isArray(refs)) {
          const ids = refs.filter((x): x is string => typeof x === "string" && x.length > 0);
          if (ids.length) yieldQueue.push({ type: "task-refs" as const, ids });
        }
        taskRefsEmitted = true;
      }
    }
  }

  // Safety net: if the model ignores toolChoice="required" and emits plain
  // text (rare, but it has happened), surface it as the message rather than
  // returning an empty reply.
  let fallbackText = "";
  // Captured from `error` parts on fullStream — surfaced as the user-facing
  // message when nothing else came through (e.g. gateway 429 rate limit).
  let streamErrorText = "";

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
      const errAny = part.error as { name?: string; statusCode?: number; message?: string };
      let code = "model_error";
      if (errAny?.statusCode === 429 || /rate.?limit/i.test(errAny?.message ?? "")) {
        code = "rate_limited";
        streamErrorText =
          "I'm being rate-limited by the AI provider right now. Try again in a minute.";
      } else if (errAny?.message) {
        streamErrorText = `Something went wrong: ${errAny.message}`;
      } else {
        streamErrorText = "Something went wrong reaching the model.";
      }
      // Distinct error event so the frontend can render it differently
      // (and still see it in the response if the connection closes).
      yieldQueue.push({
        type: "error" as const,
        code,
        message: streamErrorText,
        detail: errAny?.message,
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
    // null on success; set when the model stream emitted an error part so
    // the frontend can flag it even after the SSE connection closes.
    error: streamErrorText
      ? { message: streamErrorText, raw: streamErrorText }
      : null,
  };
});
