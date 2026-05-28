<script lang="ts">
  import { Plus, Mic } from "lucide-svelte";
  import { tapMedium, notifyWarning } from "$lib/haptics";

  let {
    onTapSend,
    onRecorded,
    onError,
  }: {
    onTapSend: () => void;
    onRecorded: (file: File) => void;
    onError: (message: string) => void;
  } = $props();

  const HOLD_MS = 280;

  let recording = $state(false);

  let pointerDown = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  // Set when the user discards instead of sending, so `onstop` knows to drop
  // the recording rather than forward it.
  let discard = false;
  // Pointer can release before the mic permission resolves; in that case
  // `startRecording` checks this and stops itself immediately.
  let starting = false;

  function pickMime(): { mimeType?: string; ext: string } {
    // Order matters: Gemini accepts mp4(AAC), mp3, wav, flac, ogg — not
    // webm-container. iOS Safari only does mp4 anyway; on Chrome we pick mp4
    // when available and otherwise fall back to webm (which the backend
    // relabels as audio/ogg since both carry opus).
    const order: [string, string][] = [
      ["audio/mp4", "mp4"],
      ["audio/mpeg", "mp3"],
      ["audio/webm", "webm"],
    ];
    for (const [mimeType, ext] of order) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType))
        return { mimeType, ext };
    }
    return { ext: "m4a" };
  }

  function cleanupTimers() {
    recording = false;
  }

  async function startRecording() {
    starting = true;
    tapMedium();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting = false;
      notifyWarning();
      onError(
        "Microphone access is blocked. Enable it for Eos in your device settings, then try again.",
      );
      return;
    }

    const { mimeType, ext } = pickMime();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    discard = false;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      cleanupTimers();
      if (discard || chunks.length === 0) return;
      const type = mediaRecorder?.mimeType || mimeType || "audio/mp4";
      onRecorded(new File(chunks, `recording.${ext}`, { type }));
    };

    mediaRecorder.start();
    recording = true;
    starting = false;

    // User released the button while we were still waiting on permission —
    // stop right away so the brief recording still ships.
    if (!pointerDown) stopRecording(false);
  }

  function stopRecording(cancelled: boolean) {
    if (!recording) return;
    tapMedium();
    discard = cancelled;
    mediaRecorder?.stop();
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    pointerDown = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (pointerDown) void startRecording();
    }, HOLD_MS);
  }

  function onPointerUp() {
    pointerDown = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      onTapSend();
      return;
    }
    if (recording) stopRecording(false);
  }

  function onPointerCancel() {
    pointerDown = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      return;
    }
    if (recording) stopRecording(true);
  }

</script>

<button
  type="button"
  onpointerdown={onPointerDown}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  oncontextmenu={(e) => e.preventDefault()}
  aria-label={recording ? "Release to send voice" : "Send (hold to record voice)"}
  class="w-11 h-[46px] rounded-2xl flex items-center justify-center shrink-0
    select-none touch-none [-webkit-touch-callout:none] [-webkit-user-select:none]
    {recording
      ? 'bg-[var(--color-voice)] animate-glow-pulse'
      : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] transition-all duration-300 hover:shadow-lg hover:shadow-[var(--color-accent-glow)] active:scale-95'}"
>
  {#if recording}
    <Mic size={18} class="text-white" />
  {:else}
    <Plus size={18} strokeWidth={2.5} class="text-[var(--color-bg)]" />
  {/if}
</button>
