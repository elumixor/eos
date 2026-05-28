import { api, type Task } from "$lib/api";
import { sync } from "$lib/sync.svelte";
import { tasks as tasksStore } from "$lib/tasks.svelte";
import { toasts } from "$lib/toast.svelte";

// Single-level voice undo/redo + transient bubble state. The voice agent
// streams actions back; we apply them locally, record inverses, and expose
// undo/redo for the LAST turn only. History stays so follow-up turns
// ("list those tasks") still have context.

const HISTORY_MAX = 10;
type Inverse = () => Promise<void>;
type RecordableTask = Task & { deletedAt?: string | null };

class VoiceTurn {
  loading = $state(false);
  recording = $state(false);
  message = $state<string | null>(null);
  stream = $state<MediaStream | null>(null);
  taskRefs = $state<string[]>([]);
  canUndo = $state(false);
  canRedo = $state(false);

  #history: { transcript: string; message: string }[] = [];
  #inverses: Inverse[] = [];
  #originals: RecordableTask[] = [];

  setRecording(stream: MediaStream | null) {
    this.stream = stream;
    this.recording = stream !== null;
  }

  setError(message: string) {
    this.message = message;
  }

  dismiss() {
    this.message = null;
    this.#inverses = [];
    this.#originals = [];
    this.canUndo = false;
    this.canRedo = false;
    this.taskRefs = [];
  }

  async record(file: File, clientDate: string, clientTzOffsetMin: number) {
    this.loading = true;
    this.message = "";
    try {
      const formData = new FormData();
      formData.append("audio", file);
      if (this.#history.length > 0) formData.append("history", JSON.stringify(this.#history));
      formData.append("clientDate", clientDate);
      formData.append("clientTzOffsetMin", String(clientTzOffsetMin));

      const newInverses: Inverse[] = [];
      const newOriginals: RecordableTask[] = [];
      this.#resetTurn();

      let streamedTranscript = "";
      let streamedError: string | null = null;
      const stream = api.voice.transcribe.$post(formData);
      for await (const ev of stream) {
        if (ev.type === "message") this.message = (this.message ?? "") + ev.text;
        else if (ev.type === "transcript") streamedTranscript = ev.text;
        else if (ev.type === "task-refs") this.taskRefs = ev.ids;
        else if (ev.type === "error") {
          streamedError = ev.message;
          this.message = ev.message;
        } else if (ev.type === "action") {
          const task = ev.task as RecordableTask;
          const prior = tasksStore.byId(task.id);
          const wasDeleted = Boolean(task.deletedAt);
          await tasksStore.applyRemote(task);
          newInverses.push(buildInverse(task, prior, wasDeleted));
          newOriginals.push(task);
        }
      }
      const result = await stream.done;
      const errorFromResponse = (result as { error?: { message: string } | null }).error;
      const effectiveError = streamedError ?? errorFromResponse?.message ?? null;
      if (effectiveError) this.message = effectiveError;
      else if (result.message) this.message = result.message;

      const finalTranscript = result.transcription || streamedTranscript;
      if (!effectiveError && (finalTranscript || result.message)) {
        this.#history = [...this.#history, { transcript: finalTranscript, message: result.message ?? "" }].slice(
          -HISTORY_MAX,
        );
      }
      void sync.runNow();
      this.#inverses = newInverses.reverse();
      this.#originals = newOriginals;
      this.canUndo = this.#inverses.length > 0;
      this.canRedo = false;
    } catch {
      this.message = "Something went wrong processing that. Please try again.";
      toasts.error("Voice request failed");
    } finally {
      this.loading = false;
    }
  }

  async undo() {
    if (!this.canUndo || !this.#inverses.length) return;
    this.canUndo = false;
    for (const inv of this.#inverses) {
      try {
        await inv();
      } catch {
        // best-effort
      }
    }
    this.canRedo = this.#originals.length > 0;
  }

  async redo() {
    if (!this.canRedo || !this.#originals.length) return;
    this.canRedo = false;
    for (const orig of this.#originals) {
      try {
        await tasksStore.applyRemote(orig);
      } catch {
        // best-effort
      }
    }
    this.canUndo = this.#inverses.length > 0;
  }

  #resetTurn() {
    this.#inverses = [];
    this.#originals = [];
    this.canUndo = false;
    this.canRedo = false;
    this.taskRefs = [];
  }
}

function buildInverse(after: RecordableTask, prior: Task | undefined, wasDeleted: boolean): Inverse {
  if (wasDeleted && prior) {
    const snapshot = prior;
    return () => tasksStore.restore(snapshot);
  }
  if (!prior) return () => tasksStore.remove(after.id);
  const patch: Partial<Task> = {
    text: prior.text,
    completed: prior.completed,
    bucket: prior.bucket,
  };
  return async () => {
    await tasksStore.update(after.id, patch);
  };
}

export const voiceTurn = new VoiceTurn();
