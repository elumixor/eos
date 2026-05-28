<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2, X } from "lucide-svelte";
  import { archivePop, isArchived } from "$lib/archive.svelte";
  import RichTaskInput from "$lib/components/RichTaskInput.svelte";
  import { api, type Bucket, type Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import { projects } from "$lib/projects.svelte";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { sync } from "$lib/sync.svelte";
  import { displayBucket, extractFields, projectIds, type DisplayBucket } from "$lib/tokens";
  import { ls } from "$lib/storage";
  import BucketSection from "$lib/components/BucketSection.svelte";
  import ProjectPicker from "$lib/components/ProjectPicker.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import TaskContent from "$lib/components/TaskContent.svelte";
  import VoiceButton from "$lib/components/VoiceButton.svelte";
  import VoiceVisualizer from "$lib/components/VoiceVisualizer.svelte";
  import BoxSelect from "$lib/components/BoxSelect.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { toasts } from "$lib/toast.svelte";

  // Tasks come from the offline-first store. It hydrates from IDB on boot
  // and applies sync deltas in the background, so first paint is instant.
  const tasks = $derived(tasksStore.list);
  let voiceLoading = $state(false);
  let voiceMessage = $state<string | null>(null);
  let voiceRecording = $state(false);
  let voiceStream = $state<MediaStream | null>(null);
  // Conversation context for the voice agent. Lives in memory only and
  // resets when the user dismisses the response panel.
  let voiceHistory = $state<{ transcript: string; message: string }[]>([]);
  const VOICE_HISTORY_MAX = 10;
  // Inverse actions for the LAST voice turn. Reset every turn (single-level
  // undo by design — see notes in dev memory). Each entry is a closure that
  // reverses one mutation when called.
  type Inverse = () => Promise<void>;
  let voiceTurnInverses: Inverse[] = [];
  // Parallel to inverses but in original forward order — replayed on redo.
  let voiceTurnOriginals: (Task & { deletedAt?: string | null })[] = [];
  let canUndoVoice = $state(false);
  let canRedoVoice = $state(false);
  // Task ids the model wants displayed under the reply (e.g. "show me my
  // overdue tasks"). Rendered as a small list — we look each id up in the
  // local store, so the chip reflects current state.
  let voiceTaskRefs = $state<string[]>([]);
  // Bound to the bubble element so the outside-click listener can tell
  // whether a pointerdown landed inside or outside the bubble.
  let voiceBubbleEl: HTMLDivElement | undefined = $state();
  let addInput: RichTaskInput | undefined = $state();
  let pickerOpen = $state(false);

  // Section visibility (eye toggle). Persisted to local storage so it
  // survives reloads.
  type SectionKey = DisplayBucket;
  const HIDDEN_KEY = "hiddenBuckets";
  let hiddenBuckets = $state<Record<SectionKey, boolean>>({
    overdue: false,
    today: false,
    week: false,
    later: false,
  });

  const matchesFilter = (t: Task) => {
    if (!projects.filterId) return true;
    const wanted = projects.descendantIds(projects.filterId);
    return projectIds(t.text).some((id) => wanted.has(id));
  };

  const visibleTasks = $derived(tasks.filter(matchesFilter));

  // Bucketing: stored bucket + scheduledAt, with overdue derived for
  // today/week tasks whose stamp is in a previous period.
  // Completed tasks that have rolled off (overdue/later display) live in the
  // archive view, not in the main sections. Today/week sections keep their
  // own completed items so the dopamine of crossing-out stays in place.
  const buckets = $derived.by(() => {
    const out: Record<SectionKey, Task[]> = { overdue: [], today: [], week: [], later: [] };
    for (const t of visibleTasks) {
      if (isArchived(t)) continue;
      out[displayBucket(t)].push(t);
    }
    return out;
  });
  const archivedCount = $derived(tasks.filter((t) => isArchived(t)).length);

  // Scale-pop the archive button each time a task transitions into archive.
  let popClass = $state("");
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (archivePop.tick === 0) return;
    popClass = "animate-archive-pop";
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(() => (popClass = ""), 450);
  });

  const draggedTask = $derived(
    dnd.taskId ? tasks.find((t) => t.id === dnd.taskId) : undefined,
  );

  onMount(() => {
    void tasksStore.boot();
    void projects.boot();
    void (async () => {
      try {
        const raw = await ls.get(HIDDEN_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>;
          hiddenBuckets = { ...hiddenBuckets, ...parsed };
        }
      } catch {
        // stale / hand-edited preference — fall back to defaults
      }
    })();
    dnd.onDrop = commitDrop;
    window.addEventListener("keydown", onGlobalKeydown);
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onGlobalKeydown);
      window.removeEventListener("pointerdown", onOutsidePointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  });

  // Hide the bubble when the user taps anywhere outside it (and outside the
  // voice button itself, so a fresh hold doesn't get eaten by dismissing).
  // Bubble is only shown when there's a finalised message — we skip dismiss
  // while loading / recording so an in-flight response isn't aborted.
  function onOutsidePointerDown(e: PointerEvent) {
    if (!voiceMessage || voiceLoading || voiceRecording) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (voiceBubbleEl?.contains(target)) return;
    // Pointerdown on the voice button (or anything inside the input row)
    // also keeps the bubble — the user is starting a follow-up turn.
    const inInputRow = (target as Element).closest?.("[data-voice-keep]");
    if (inInputRow) return;
    dismissVoice();
  }

  function onWindowBlur() {
    if (voiceLoading || voiceRecording) return;
    if (voiceMessage) dismissVoice();
  }

  function persistHidden() {
    void ls.set(HIDDEN_KEY, JSON.stringify(hiddenBuckets));
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+Z — undo the last voice turn (or redo it if it's already
    // been undone). Cmd/Ctrl+Shift+Z — explicit redo. Skipped when focus is
    // inside an editable so native undo still works while typing.
    if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
      if (isEditableTarget(e.target)) return;
      const wantsRedo = e.shiftKey;
      if (wantsRedo) {
        if (!canRedoVoice) return;
        e.preventDefault();
        void redoVoice();
        return;
      }
      if (canUndoVoice) {
        e.preventDefault();
        void undoVoice();
        return;
      }
      if (canRedoVoice) {
        e.preventDefault();
        void redoVoice();
        return;
      }
      return;
    }
    if (e.key !== "k" && e.key !== "K") return;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.altKey || e.shiftKey) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    pickerOpen = !pickerOpen;
  }

  function isEditableTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  // Map a list id ("bucket:today" etc.) to the stored bucket value. Dropping
  // onto Overdue moves the task back into "today" — Overdue is derived, so
  // re-stamping a task as today resets its scheduledAt to now() and pulls
  // it out of the overdue display.
  function bucketFromListId(listId: string): Bucket | null {
    if (!listId.startsWith("bucket:")) return null;
    const k = listId.slice("bucket:".length) as DisplayBucket;
    if (k === "overdue") return "today";
    if (k === "today" || k === "week" || k === "later") return k;
    return null;
  }

  async function commitDrop({
    taskIds,
    to,
    index,
  }: {
    taskIds: string[];
    from: string;
    to: string;
    index: number;
  }) {
    const targetBucket = bucketFromListId(to);
    if (!targetBucket) return;

    const dragged = taskIds
      .map((id) => tasksStore.byId(id))
      .filter((t): t is Task => !!t);
    if (dragged.length === 0) return;

    // Build peers in the SAME order TaskList renders — pending sorted by
    // `order`, then done sorted by `updatedAt` desc. The `index` from dnd
    // is the placeholder's slot in *that* visual list, so we must splice
    // into the visual list, not an order-sorted one, or the drop lands
    // at a different slot than the placeholder showed.
    const draggedIds = new Set(dragged.map((t) => t.id));
    const bucketPeers = tasks.filter(
      (t) => !draggedIds.has(t.id) && t.bucket === targetBucket && !isArchived(t),
    );
    const pendingPeers: Task[] = [];
    const donePeers: Task[] = [];
    for (const t of bucketPeers) (t.completed ? donePeers : pendingPeers).push(t);
    pendingPeers.sort((a, b) => a.order - b.order);
    donePeers.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    const visualPeers = [...pendingPeers, ...donePeers];
    const at = Math.max(0, Math.min(index, visualPeers.length));

    // No-op: same bucket, dropped right where the placeholder already
    // sat — skip so we don't bump updatedAt and scramble the done block.
    if (dragged.length === 1 && dragged[0].bucket === targetBucket) {
      const t = dragged[0];
      const curIdx = t.completed
        ? pendingPeers.length +
          [...donePeers, t]
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
            .indexOf(t)
        : [...pendingPeers, t].sort((a, b) => a.order - b.order).indexOf(t);
      if (curIdx === at) return;
    }

    visualPeers.splice(at, 0, ...dragged);

    // Apply bucket change first (re-stamps scheduledAt + enqueues op).
    for (const t of dragged) {
      if (t.bucket !== targetBucket) {
        await tasksStore.update(t.id, { bucket: targetBucket });
      }
    }

    // Only reorder the pending half. Done tasks sort by `updatedAt`, so
    // re-numbering them does nothing useful and would bump their
    // updatedAt, scrambling the done block. A done task dropped into the
    // pending area still surfaces to the top of done via the bucket
    // update above (or, if same bucket, was caught by the no-op check).
    const newPending = visualPeers.filter((t) => !t.completed);
    await tasksStore.reorder(
      newPending.map((t, i) => ({ id: t.id, order: i, bucket: targetBucket })),
    );
  }

  async function handleAddTask(text: string) {
    await tasksStore.create({ text, bucket: "today", ...extractFields(text) });
  }

  function submitNewTask(text: string) {
    void handleAddTask(text);
    addInput?.clear();
  }

  // Per-task monotonic sequence so rapid double-taps coalesce safely.
  const toggleSeq = new Map<string, number>();
  const confirmedToggle = new Map<string, boolean>();

  async function handleToggleTask(task: Task) {
    const id = task.id;
    const target = !task.completed;
    if (!confirmedToggle.has(id)) confirmedToggle.set(id, task.completed);
    // Completing a "later" task pulls it into Today so the user sees the win
    // instead of the task vanishing straight to archive.
    const promote = target && task.bucket === "later";
    const patch: Partial<Task> = promote
      ? ({ completed: target, bucket: "today" } as Partial<Task>)
      : { completed: target };
    if (target && !promote && isArchived({ ...task, completed: true })) archivePop.bump();
    const seq = (toggleSeq.get(id) ?? 0) + 1;
    toggleSeq.set(id, seq);
    try {
      const updated = await tasksStore.update(id, patch);
      if (toggleSeq.get(id) !== seq) return;
      if (updated) confirmedToggle.set(id, updated.completed);
      toggleSeq.delete(id);
    } catch {
      if (toggleSeq.get(id) !== seq) return;
      const safe = confirmedToggle.get(id) ?? !target;
      await tasksStore.update(id, { completed: safe });
      toggleSeq.delete(id);
      toasts.error("Couldn't update task — please try again");
    }
  }

  async function handleDeleteTask(task: Task) {
    await tasksStore.remove(task.id);
  }

  async function handleEditTask(task: Task, text: string) {
    await tasksStore.update(task.id, { text, ...extractFields(text) });
  }

  async function handleDuplicateTask(task: Task) {
    await tasksStore.create({
      text: task.text,
      bucket: task.bucket as Bucket,
      ...extractFields(task.text),
    });
  }

  async function handleBulkDelete(ids: string[]) {
    multi.clear();
    for (const id of ids) await tasksStore.remove(id);
  }

  async function handleBulkComplete(ids: string[], completed: boolean) {
    for (const id of ids) await tasksStore.update(id, { completed });
  }

  async function handleVoiceRecorded(file: File) {
    voiceLoading = true;
    voiceMessage = "";
    try {
      const formData = new FormData();
      formData.append("audio", file);
      if (voiceHistory.length > 0) formData.append("history", JSON.stringify(voiceHistory));
      // Local date + tz offset so the backend can answer "today" the way the
      // user sees it. The server clock is UTC; near midnight the two diverge.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      formData.append("clientDate", today);
      formData.append("clientTzOffsetMin", String(now.getTimezoneOffset()));
      const stream = api.voice.transcribe.$post(formData);
      let streamedTranscript = "";
      let streamedError: string | null = null;
      const newInverses: Inverse[] = [];
      const newOriginals: (Task & { deletedAt?: string | null })[] = [];
      voiceTurnInverses = [];
      voiceTurnOriginals = [];
      canUndoVoice = false;
      canRedoVoice = false;
      voiceTaskRefs = [];
      for await (const ev of stream) {
        if (ev.type === "message") voiceMessage = (voiceMessage ?? "") + ev.text;
        else if (ev.type === "transcript") streamedTranscript = ev.text;
        else if (ev.type === "task-refs") voiceTaskRefs = ev.ids;
        else if (ev.type === "error") {
          streamedError = ev.message;
          // Show the error in the bubble immediately so the user isn't
          // staring at a spinner that turns into nothing.
          voiceMessage = ev.message;
        } else if (ev.type === "action") {
          const task = ev.task as Task & { deletedAt?: string | null };
          // Snapshot pre-state BEFORE the remote apply, so the inverse can
          // restore exactly what was there.
          const prior = tasksStore.byId(task.id);
          const wasDeleted = Boolean(task.deletedAt);
          await tasksStore.applyRemote(task);
          newInverses.push(buildInverse(task, prior, wasDeleted));
          newOriginals.push(task);
        }
      }
      const result = await stream.done;
      // Final reconciliation: prefer the complete server message in case any
      // streamed character was missed mid-flight.
      const errorFromResponse = (result as { error?: { message: string } | null }).error;
      const effectiveError = streamedError ?? errorFromResponse?.message ?? null;
      if (effectiveError) {
        voiceMessage = effectiveError;
      } else if (result.message) {
        voiceMessage = result.message;
      }
      const finalTranscript = result.transcription || streamedTranscript;
      // Only persist successful turns to history — feeding a "rate limited"
      // error back to Gemini as assistant context next turn is useless.
      if (!effectiveError && (finalTranscript || result.message)) {
        voiceHistory = [
          ...voiceHistory,
          { transcript: finalTranscript, message: result.message ?? "" },
        ].slice(-VOICE_HISTORY_MAX);
      }
      // Belt-and-braces in case an action event was missed mid-stream.
      void sync.runNow();
      // Inverses are applied newest-first, so reverse the recording order.
      voiceTurnInverses = newInverses.reverse();
      voiceTurnOriginals = newOriginals;
      canUndoVoice = voiceTurnInverses.length > 0;
      canRedoVoice = false;
    } catch {
      voiceMessage = "Something went wrong processing that. Please try again.";
    } finally {
      voiceLoading = false;
    }
  }

  function dismissVoice() {
    voiceMessage = null;
    voiceTurnInverses = [];
    voiceTurnOriginals = [];
    canUndoVoice = false;
    canRedoVoice = false;
    voiceTaskRefs = [];
    // History stays so follow-up turns ("list those tasks") still have
    // context. It's only cleared when the user reloads the page.
  }

  function buildInverse(
    after: Task & { deletedAt?: string | null },
    prior: Task | undefined,
    wasDeleted: boolean,
  ): Inverse {
    // delete: prior was alive, now tombstoned → restore it.
    if (wasDeleted && prior) {
      const snapshot = prior;
      return () => tasksStore.restore(snapshot);
    }
    // create: no prior local copy → delete the new task.
    if (!prior) {
      return () => tasksStore.remove(after.id);
    }
    // update of any kind: write the prior fields back. Only keys that could
    // have changed via voice need to be patched.
    const patch: Partial<Task> = {
      text: prior.text,
      completed: prior.completed,
      bucket: prior.bucket,
    };
    return async () => {
      await tasksStore.update(after.id, patch);
    };
  }

  async function undoVoice() {
    if (!canUndoVoice || !voiceTurnInverses.length) return;
    canUndoVoice = false;
    for (const inv of voiceTurnInverses) {
      try {
        await inv();
      } catch {
        // best-effort — keep applying the rest
      }
    }
    // Flip into redo state — originals stay so we can replay them.
    canRedoVoice = voiceTurnOriginals.length > 0;
  }

  async function redoVoice() {
    if (!canRedoVoice || !voiceTurnOriginals.length) return;
    canRedoVoice = false;
    for (const orig of voiceTurnOriginals) {
      try {
        // applyRemote handles both alive (insert/update) and tombstoned
        // (delete) records, so this re-runs the original mutation faithfully.
        await tasksStore.applyRemote(orig);
      } catch {
        // best-effort
      }
    }
    canUndoVoice = voiceTurnInverses.length > 0;
  }

  function handleVoiceError(message: string) {
    voiceMessage = message;
  }

  // Voice bubble stays until the user dismisses it (X) or starts a new
  // turn. Auto-hide was rage-inducing when the model was mid-reading; keep
  // it dismissible only.

  const SECTION_ORDER: SectionKey[] = ["overdue", "today", "week", "later"];
  const SECTION_TITLE: Record<SectionKey, string> = {
    overdue: "Overdue",
    today: "Today",
    week: "This week",
    later: "Later",
  };
</script>

<div class="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none
  bg-[radial-gradient(ellipse_at_center,var(--color-accent-glow)_0%,transparent_70%)] opacity-40"></div>

<TopBar {archivedCount} {popClass} />

<main
  class="relative max-w-md mx-auto px-5 pb-36 min-h-screen"
  style="padding-top: calc(env(safe-area-inset-top, 0px) + 4.5rem);"
>

  <div class="space-y-5">
    {#each SECTION_ORDER as key (key)}
      {#if key !== "overdue" || buckets[key].length > 0}
      <BucketSection
        title={SECTION_TITLE[key]}
        listId={`bucket:${key}`}
        tasks={buckets[key]}
        bind:hidden={hiddenBuckets[key]}
        onToggleHidden={persistHidden}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onEditTask={handleEditTask}
        onDuplicateTask={handleDuplicateTask}
        onBulkDelete={handleBulkDelete}
        onBulkComplete={handleBulkComplete}
      />
      {/if}
    {/each}
  </div>
</main>

{#if pickerOpen}
  <ProjectPicker onClose={() => (pickerOpen = false)} />
{/if}

<div class="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="max-w-md mx-auto px-5 pt-14 pointer-events-auto
      bg-[linear-gradient(to_top,var(--color-bg)_0%,var(--color-bg)_75%,transparent_100%)]"
    style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
  >
    {#if voiceMessage || voiceLoading || voiceRecording}
      <div
        bind:this={voiceBubbleEl}
        class="relative px-4 pt-3 pb-6 -mb-4 rounded-t-2xl bg-[var(--color-accent)]
          border border-b-0 border-[var(--color-accent)] animate-fade-up"
      >
        {#if voiceRecording}
          <VoiceVisualizer stream={voiceStream} />
        {:else if voiceLoading && !voiceMessage}
          <div class="flex items-center justify-center h-14">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce [animation-delay:-0.32s]"></span>
              <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce [animation-delay:-0.16s]"></span>
              <span class="w-2 h-2 rounded-full bg-white animate-voice-bounce"></span>
            </div>
          </div>
        {:else}
          <div class="flex items-start gap-3">
            <p
              class="flex-1 min-h-[18px] text-[13px] font-light leading-relaxed text-white
                whitespace-pre-wrap"
            >
              {voiceMessage}{#if voiceLoading}<span class="inline-block w-1.5 h-1.5 ml-1 align-middle rounded-full bg-white animate-pulse"></span>{/if}
            </p>
            {#if !voiceLoading && voiceMessage}
              <div class="shrink-0 -mt-0.5 flex items-center gap-1">
                {#if canUndoVoice}
                  <button
                    onclick={undoVoice}
                    aria-label="Undo last voice turn"
                    title="Undo (⌘Z)"
                    class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white/90
                      hover:text-white hover:bg-white/15 transition-colors"
                  >
                    Undo
                  </button>
                {:else if canRedoVoice}
                  <button
                    onclick={redoVoice}
                    aria-label="Redo last voice turn"
                    title="Redo (⌘⇧Z)"
                    class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white/90
                      hover:text-white hover:bg-white/15 transition-colors"
                  >
                    Redo
                  </button>
                {/if}
                <button
                  onclick={dismissVoice}
                  aria-label="Dismiss"
                  class="p-1 rounded-lg text-white/70 hover:text-white
                    hover:bg-white/10 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            {/if}
          </div>
          {#if voiceTaskRefs.length > 0}
            <ul class="mt-3 space-y-1.5">
              {#each voiceTaskRefs as id (id)}
                {@const t = tasksStore.byId(id)}
                {#if t}
                  <li
                    class="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)]
                      shadow-sm"
                  >
                    <span
                      class="mt-1 shrink-0 w-3.5 h-3.5 rounded-sm border
                        {t.completed
                        ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                        : 'border-[var(--color-ink-3)]'}"
                    ></span>
                    <div class="flex-1 min-w-0">
                      <TaskContent task={t} dimmed={t.completed} />
                    </div>
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}
    <div class="relative" data-voice-keep>
      <RichTaskInput
        bind:this={addInput}
        placeholder="@ for project, time, place"
        onsubmit={submitNewTask}
      >
        {#snippet endSlot()}
          {#if voiceLoading}
            <div class="w-8 h-8 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center">
              <Loader2 size={14} class="animate-spin text-[var(--color-ink-2)]" />
            </div>
          {:else}
            <VoiceButton
              compact
              onRecorded={handleVoiceRecorded}
              onError={handleVoiceError}
              onTapSend={() => addInput?.submit()}
              onStart={(s) => {
                voiceStream = s;
                voiceRecording = true;
              }}
              onStop={() => {
                voiceRecording = false;
                voiceStream = null;
              }}
            />
          {/if}
        {/snippet}
      </RichTaskInput>
    </div>
  </div>
</div>

<BoxSelect />

<Toast />

{#if dnd.active}
  <div
    class="fixed z-50 pointer-events-none px-4 py-3.5 rounded-2xl bg-[var(--color-surface-2)]
      shadow-xl shadow-black/40 text-[13px] font-light tracking-wide text-[var(--color-ink)]
      border border-[var(--color-accent)]/30 animate-drag-lift"
    style="left: {dnd.startLeft}px; top: {dnd.y - dnd.offsetY}px; width: {dnd.width}px;"
  >
    {#if dnd.taskIds.length > 1}
      <span class="font-medium text-[var(--color-accent)]">{dnd.label}</span>
    {:else if draggedTask}
      <TaskContent task={draggedTask} />
    {:else}
      {dnd.label}
    {/if}
  </div>
{/if}
