export type VoiceEvent =
  | { type: "message"; text: string }
  | { type: "transcript"; text: string }
  | { type: "task-refs"; ids: string[] }
  | { type: "action"; task: unknown }
  | { type: "error"; code: string; message: string; detail?: string };

// Incremental flusher for the streamed record() tool input. Reply text is
// streamed as it grows; transcript and taskRefs are emitted once their slot
// in the JSON object is observably closed.
export function createFlusher(yieldQueue: VoiceEvent[]) {
  let replyEmitted = "";
  let transcriptEmitted = false;
  let taskRefsEmitted = false;

  return {
    get replyEmitted() {
      return replyEmitted;
    },
    flush(o: Record<string, unknown>, finalised: boolean) {
      const reply = o.reply;
      if (typeof reply === "string" && reply.length > replyEmitted.length) {
        yieldQueue.push({ type: "message", text: reply.slice(replyEmitted.length) });
        replyEmitted = reply;
      }
      if (!transcriptEmitted) {
        const transcript = o.transcript;
        const transcriptClosed = finalised || "taskRefs" in o;
        if (typeof transcript === "string" && transcriptClosed) {
          yieldQueue.push({ type: "transcript", text: transcript });
          transcriptEmitted = true;
        }
      }
      if (!taskRefsEmitted && finalised) {
        const refs = o.taskRefs;
        if (Array.isArray(refs)) {
          const ids = refs.filter((x): x is string => typeof x === "string" && x.length > 0);
          if (ids.length) yieldQueue.push({ type: "task-refs", ids });
        }
        taskRefsEmitted = true;
      }
    },
  };
}
