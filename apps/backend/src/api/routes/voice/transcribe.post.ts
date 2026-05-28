import { createGateway } from "@ai-sdk/gateway";
import { parsePartialJson, stepCountIs, streamText } from "ai";
import { env } from "env";
import { readFormData } from "h3";
import { trackEvent } from "services/analytics";
import { requireAuth } from "services/auth";
import {
  buildSystemPrompt,
  buildTools,
  createFlusher,
  historySchema,
  mediaTypeFor,
  type RecordInput,
  recordSchema,
  type VoiceEvent,
} from "services/voice";
import { handler } from "utils";

// Vercel AI Gateway. Lets us address any provider/model via a single key
// and get streaming + cross-provider format normalization for free.
const gateway = createGateway({ apiKey: env.VERCEL_AI_KEY });

export default handler(async function* ({ user, event }) {
  requireAuth(user);
  const userId = user.id;
  const startedAt = Date.now();
  const formData = await readFormData(event);
  const audioFile = formData.get("audio") as File;
  if (!audioFile) {
    await trackEvent("voice_failed", userId, { reason: "no_audio" });
    throw new Error("No audio file provided");
  }

  const bytes = new Uint8Array(await audioFile.arrayBuffer());
  const mediaType = mediaTypeFor(audioFile);

  const historyRaw = formData.get("history");
  const historyParsed = typeof historyRaw === "string" ? historySchema.safeParse(JSON.parse(historyRaw)) : null;
  const history = historyParsed?.success ? historyParsed.data.slice(-10) : [];

  // Client-supplied "today" (YYYY-MM-DD, local) and tz offset in minutes
  // (Date.prototype.getTimezoneOffset()). Fall back to UTC if missing.
  const rawClientDate = formData.get("clientDate");
  const clientDate =
    typeof rawClientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawClientDate)
      ? rawClientDate
      : new Date().toISOString().slice(0, 10);
  const rawTz = formData.get("clientTzOffsetMin");
  const tzOffsetMin = typeof rawTz === "string" && /^-?\d+$/.test(rawTz) ? parseInt(rawTz, 10) : 0;
  // SQL modifier that shifts a UTC datetime to the user's local time.
  const localShift = `${-tzOffsetMin} minutes`;

  const yieldQueue: VoiceEvent[] = [];
  const { tools, actionsApplied: getActionsApplied } = wrapActions(
    buildTools({ userId, clientDate, localShift, yieldQueue }),
  );

  const priorMessages = history.flatMap((h) => [
    { role: "user" as const, content: h.transcript },
    { role: "assistant" as const, content: h.message },
  ]);

  const stream = streamText({
    model: gateway("google/gemini-2.5-flash"),
    system: buildSystemPrompt(clientDate),
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
    tools,
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
  let toolInput: RecordInput | null = null;
  const flusher = createFlusher(yieldQueue);

  // Safety net: if the model ignores toolChoice="required" and emits plain
  // text, surface it as the message rather than returning an empty reply.
  let fallbackText = "";
  // Captured from `error` parts on fullStream — surfaced as the user-facing
  // message when nothing else came through (e.g. gateway 429).
  let streamErrorText = "";

  for await (const part of stream.fullStream) {
    if (part.type === "text-delta") {
      fallbackText += part.text;
      // Only stream the fallback if record() hasn't claimed the reply slot.
      if (flusher.replyEmitted === "") yieldQueue.push({ type: "message", text: part.text });
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
        flusher.flush(obj as Record<string, unknown>, parsed.state === "successful-parse");
      }
    } else if (part.type === "tool-call" && part.toolName === "record") {
      const parsed = recordSchema.safeParse(part.input);
      if (parsed.success) toolInput = parsed.data;
      else
        console.warn("[voice.record] tool-call input failed schema", {
          userId,
          input: part.input,
          issues: parsed.error.issues,
        });
    } else if (part.type === "error") {
      streamErrorText = errorMessageFrom(part.error);
      console.error("[voice.stream] error part from model", { userId, error: part.error });
      yieldQueue.push({
        type: "error",
        code: streamErrorText.startsWith("I'm being") ? "rate_limited" : "model_error",
        message: streamErrorText,
        detail: (part.error as { message?: string })?.message,
      });
    }
    while (yieldQueue.length) {
      const next = yieldQueue.shift();
      if (next !== undefined) yield next;
    }
  }

  // Final reconciliation in case the streaming pass missed any boundaries.
  if (toolInput) {
    flusher.flush(toolInput as unknown as Record<string, unknown>, true);
    while (yieldQueue.length) {
      const next = yieldQueue.shift();
      if (next !== undefined) yield next;
    }
  }

  const durationMs = Date.now() - startedAt;
  const finalMessage = (toolInput?.reply ?? flusher.replyEmitted ?? fallbackText).trim();
  const finalTranscript = toolInput?.transcript ?? "";

  console.info("[voice] turn done", {
    userId,
    durationMs,
    audioBytes: bytes.byteLength,
    mediaType,
    historyTurns: history.length,
    recordCalled: Boolean(toolInput),
    actionsApplied: getActionsApplied(),
    messageLen: finalMessage.length,
    transcriptLen: finalTranscript.length,
  });
  if (!finalMessage) console.warn("[voice] empty message returned", { userId });

  void trackEvent("voice_used", userId, {
    durationMs,
    audioBytes: bytes.byteLength,
    actionsApplied: getActionsApplied(),
    hadTranscript: Boolean(finalTranscript),
    recordCalled: Boolean(toolInput),
  });

  return {
    transcription: finalTranscript,
    message: finalMessage,
    // null on success; set when the model stream emitted an error part so
    // the frontend can flag it even after the SSE connection closes.
    error: streamErrorText ? { message: streamErrorText, raw: streamErrorText } : null,
  };
});

function errorMessageFrom(error: unknown): string {
  const e = error as { statusCode?: number; message?: string } | null;
  if (e?.statusCode === 429 || /rate.?limit/i.test(e?.message ?? "")) {
    return "I'm being rate-limited by the AI provider right now. Try again in a minute.";
  }
  if (e?.message) return `Something went wrong: ${e.message}`;
  return "Something went wrong reaching the model.";
}

// buildTools returns actionsApplied as a getter on the object; wrap so the
// rest of the file can read it as a function for clarity.
function wrapActions(t: ReturnType<typeof buildTools>) {
  return { tools: t.tools, actionsApplied: () => t.actionsApplied };
}
