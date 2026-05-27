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
  let elapsed = $state(0);

  let pointerDown = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  // Set when the user discards instead of sending, so `onstop` knows to drop
  // the recording rather than forward it.
  let discard = false;
  // Pointer can release before the mic permission resolves; in that case
  // `startRecording` checks this and stops itself immediately.
  let starting = false;

  function pickMime(): { mimeType?: string; ext: string } {
    const order: [string, string][] = [
      ["audio/webm", "webm"],
      ["audio/mp4", "mp4"],
      ["audio/mpeg", "mp3"],
    ];
    for (const [mimeType, ext] of order) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType))
        return { mimeType, ext };
    }
    return { ext: "m4a" };
  }

  function cleanupTimers() {
    if (timer) clearInterval(timer);
    timer = null;
    recording = false;
    elapsed = 0;
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
    elapsed = 0;
    timer = setInterval(() => elapsed++, 1000);
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

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }
</script>

{#if recording}
  <button
    type="button"
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="Release to send voice"
    class="flex items-center gap-1.5 h-[46px] px-3 rounded-2xl bg-[var(--color-voice)]
      animate-glow-pulse shrink-0 select-none touch-none"
  >
    <Mic size={16} class="text-white" />
    <span class="font-mono text-xs text-white/90 tracking-wider tabular-nums">
      {formatTime(elapsed)}
    </span>
  </button>
{:else}
  <button
    type="button"
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="Send (hold to record voice)"
    class="w-11 h-[46px] rounded-2xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
      flex items-center justify-center transition-all duration-300 shrink-0
      hover:shadow-lg hover:shadow-[var(--color-accent-glow)] active:scale-95
      select-none touch-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
  >
    <Plus size={18} strokeWidth={2.5} class="text-[var(--color-bg)]" />
  </button>
{/if}
