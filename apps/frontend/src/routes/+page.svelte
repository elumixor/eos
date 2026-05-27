<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2, Settings as SettingsIcon, X } from "lucide-svelte";
  import RichTaskInput from "$lib/components/RichTaskInput.svelte";
  import { api, type Bucket, type Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import { projects } from "$lib/projects.svelte";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { displayBucket, extractFields, projectIds, type DisplayBucket } from "$lib/tokens";
  import { ls } from "$lib/storage";
  import BucketSection from "$lib/components/BucketSection.svelte";
  import FilterBar from "$lib/components/FilterBar.svelte";
  import ProjectPicker from "$lib/components/ProjectPicker.svelte";
  import TaskContent from "$lib/components/TaskContent.svelte";
  import VoiceButton from "$lib/components/VoiceButton.svelte";
  import BoxSelect from "$lib/components/BoxSelect.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { toasts } from "$lib/toast.svelte";

  // Tasks come from the offline-first store. It hydrates from IDB on boot
  // and applies sync deltas in the background, so first paint is instant.
  const tasks = $derived(tasksStore.list);
  let voiceLoading = $state(false);
  let voiceMessage = $state<string | null>(null);
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
  const buckets = $derived.by(() => {
    const out: Record<SectionKey, Task[]> = { overdue: [], today: [], week: [], later: [] };
    for (const t of visibleTasks) out[displayBucket(t)].push(t);
    return out;
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
    return () => window.removeEventListener("keydown", onGlobalKeydown);
  });

  function persistHidden() {
    void ls.set(HIDDEN_KEY, JSON.stringify(hiddenBuckets));
  }

  function onGlobalKeydown(e: KeyboardEvent) {
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
      .filter((t): t is Task => !!t)
      .sort((a, b) => a.order - b.order);
    if (dragged.length === 0) return;

    // Reorder within the destination bucket. The store re-stamps
    // scheduledAt for any task whose bucket changed.
    const draggedIds = new Set(dragged.map((t) => t.id));
    const peers = tasks
      .filter((t) => !draggedIds.has(t.id) && t.bucket === targetBucket)
      .sort((a, b) => a.order - b.order);
    const at = Math.max(0, Math.min(index, peers.length));
    peers.splice(at, 0, ...dragged);

    // Apply bucket change first (so the store re-stamps scheduledAt and
    // enqueues the right outbox op), then commit positions in one batch.
    for (const t of dragged) {
      if (t.bucket !== targetBucket) {
        await tasksStore.update(t.id, { bucket: targetBucket });
      }
    }
    await tasksStore.reorder(
      peers.map((t, i) => ({ id: t.id, order: i, bucket: targetBucket })),
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
    const seq = (toggleSeq.get(id) ?? 0) + 1;
    toggleSeq.set(id, seq);
    try {
      const updated = await tasksStore.update(id, { completed: target });
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
    voiceMessage = null;
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const result = await api.voice.transcribe.$post(formData);
      voiceMessage = result.message ?? null;
      // The voice route mutated server-side state; sync will rehydrate the
      // store on its next tick.
    } catch {
      voiceMessage = "Something went wrong processing that. Please try again.";
    } finally {
      voiceLoading = false;
    }
  }

  function handleVoiceError(message: string) {
    voiceMessage = message;
  }

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

<main class="relative max-w-md mx-auto px-5 pt-6 pb-36 safe-top min-h-screen">
  <a
    href="/settings"
    aria-label="Settings"
    class="fixed z-30 w-10 h-10 rounded-full bg-[var(--color-surface-2)]/90 backdrop-blur
      ring-1 ring-[var(--color-border)] hover:bg-[var(--color-surface-3)]
      flex items-center justify-center transition-colors shadow-sm"
    style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem); right: 0.75rem;"
  >
    <SettingsIcon size={16} class="text-[var(--color-ink-2)]" />
  </a>

  {#if voiceMessage}
    <div
      class="flex items-start gap-3 mb-6 px-4 py-3 rounded-2xl bg-[var(--color-surface-2)]
        border border-[var(--color-border)] animate-fade-up"
    >
      <p class="flex-1 text-[13px] font-light leading-relaxed text-[var(--color-ink-2)]">
        {voiceMessage}
      </p>
      <button
        onclick={() => (voiceMessage = null)}
        aria-label="Dismiss"
        class="shrink-0 p-1 rounded-lg text-[var(--color-ink-3)] hover:text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  {/if}

  <FilterBar />
  <div class="space-y-5">
    {#each SECTION_ORDER as key (key)}
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
    {/each}
  </div>
</main>

{#if pickerOpen}
  <ProjectPicker onClose={() => (pickerOpen = false)} />
{/if}

<div class="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="max-w-md mx-auto px-5 pt-6 pointer-events-auto
      bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/95 to-transparent"
    style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
  >
    <div class="flex gap-2 items-start">
      <RichTaskInput
        bind:this={addInput}
        placeholder="What needs doing?  (@ for project, time, duration)"
        onsubmit={submitNewTask}
      />
      {#if voiceLoading}
        <div class="w-11 h-[46px] rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
          <Loader2 size={18} class="animate-spin text-[var(--color-ink-2)]" />
        </div>
      {:else}
        <VoiceButton
          onRecorded={handleVoiceRecorded}
          onError={handleVoiceError}
          onTapSend={() => addInput?.submit()}
        />
      {/if}
    </div>
  </div>
</div>

<BoxSelect />

<Toast />

{#if dnd.active}
  <div
    class="fixed z-50 pointer-events-none px-4 py-3.5 rounded-2xl bg-[var(--color-surface-2)]
      shadow-xl shadow-black/40 text-[13px] font-light tracking-wide text-[var(--color-ink)]
      border border-[var(--color-accent)]/30"
    style="left: {dnd.x - dnd.offsetX}px; top: {dnd.y - dnd.offsetY}px; width: {dnd.width}px;"
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
