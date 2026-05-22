<script lang="ts">
  import { onMount } from "svelte";
  import { Loader2, RotateCw, Plus, X } from "lucide-svelte";
  import RichTaskInput from "$lib/components/RichTaskInput.svelte";
  import { api, type Section, type Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import { projects } from "$lib/projects.svelte";
  import { sections } from "$lib/sections.svelte";
  import {
    effectiveDate,
    explicitDate,
    extractFields,
    inRange,
    localISO,
    projectIds,
    resolveRange,
    setTaskDate,
  } from "$lib/tokens";
  import DailySection from "$lib/components/DailySection.svelte";
  import RangeSection from "$lib/components/RangeSection.svelte";
  import UnscheduledSection from "$lib/components/UnscheduledSection.svelte";
  import SectionEditor from "$lib/components/SectionEditor.svelte";
  import FilterBar from "$lib/components/FilterBar.svelte";
  import TaskContent from "$lib/components/TaskContent.svelte";
  import VoiceButton from "$lib/components/VoiceButton.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import AccountButton from "$lib/components/AccountButton.svelte";
  import BoxSelect from "$lib/components/BoxSelect.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { toasts } from "$lib/toast.svelte";

  let tasks = $state<Task[]>([]);
  let loading = $state(true);
  let voiceLoading = $state(false);
  let refreshing = $state(false);
  let voiceMessage = $state<string | null>(null);
  let selectedDate = $state(localISO(new Date(), false));
  // null = closed; { section } where section is null for "create".
  let editorFor = $state<{ section: Section | null } | null>(null);
  let addInput: RichTaskInput | undefined = $state();

  const matchesFilter = (t: Task) => {
    if (!projects.filterId) return true;
    const wanted = projects.descendantIds(projects.filterId);
    return projectIds(t.text).some((id) => wanted.has(id));
  };

  const visibleTasks = $derived(tasks.filter(matchesFilter));
  const dailyTasks = $derived(visibleTasks.filter((t) => effectiveDate(t) === selectedDate));
  const unscheduledTasks = $derived(visibleTasks.filter((t) => effectiveDate(t) === null));

  const sectionRanges = $derived(sections.list.map((s) => resolveRange(s)));

  // Mutually-exclusive bucketing order: narrowest range wins (Today beats
  // This Week beats This Month), regardless of the user's display order.
  // Without this, a user who dragged "This Week" above "Today" would make
  // today's tasks appear in This Week — violating the acceptance criteria.
  // Tiebreak by user order so the layout stays stable across reorders.
  function rangeDays(r: { start: string; end: string }) {
    return (
      (new Date(`${r.end}T12:00:00`).getTime() -
        new Date(`${r.start}T12:00:00`).getTime()) /
        86400000 +
      1
    );
  }
  const bucketOrder = $derived(
    sections.list
      .map((_, i) => i)
      .sort((a, b) => {
        const da = rangeDays(sectionRanges[a]);
        const db = rangeDays(sectionRanges[b]);
        return da === db ? a - b : da - db;
      }),
  );

  const tasksBySection = $derived.by(() => {
    const buckets: Record<string, Task[]> = {};
    for (const s of sections.list) buckets[s.id] = [];
    for (const t of visibleTasks) {
      const d = effectiveDate(t);
      if (d === null || d === selectedDate) continue;
      for (const i of bucketOrder) {
        if (inRange(d, sectionRanges[i])) {
          buckets[sections.list[i].id].push(t);
          break;
        }
      }
    }
    return buckets;
  });

  const draggedTask = $derived(
    dnd.taskId ? tasks.find((t) => t.id === dnd.taskId) : undefined,
  );

  onMount(async () => {
    [tasks] = await Promise.all([api.tasks.$get(), projects.load(), sections.load()]);
    loading = false;
    dnd.onDrop = commitDrop;
  });

  async function refresh() {
    refreshing = true;
    try {
      [tasks] = await Promise.all([api.tasks.$get(), projects.load(), sections.load()]);
    } finally {
      refreshing = false;
    }
  }

  // Resolve a drop target list id into the new effective date.
  //
  // Section drops pick the first date inside the target's range that:
  //   (a) isn't the currently-selected Daily date — otherwise the task
  //       stays in Daily and the drag is a visual no-op;
  //   (b) isn't covered by a *narrower* section, since bucketing assigns
  //       the task to that narrower section instead of the drop target;
  //   (c) isn't in the past — widening "Today" to "This Week" on a
  //       Wednesday must not move the task to Monday.
  // Returns null if no such date exists; callers treat null as "cancel
  // the drop" rather than silently land on an off-target date.
  function targetDate(to: string): string | null {
    if (to.startsWith("daily:")) return to.slice("daily:".length);
    if (to.startsWith("section:")) {
      const id = to.slice("section:".length);
      const idx = sections.list.findIndex((s) => s.id === id);
      if (idx < 0) return null;
      const r = sectionRanges[idx];
      const rank = bucketOrder.indexOf(idx);
      const narrower = bucketOrder
        .slice(0, rank < 0 ? 0 : rank)
        .map((i) => sectionRanges[i]);
      const today = localISO(new Date(), false);
      const floor = today > selectedDate ? today : selectedDate;

      const start = new Date(`${r.start}T12:00:00`);
      const end = new Date(`${r.end}T12:00:00`);
      const cursor = new Date(start);
      let pastOnly: string | null = null;
      while (cursor.getTime() <= end.getTime()) {
        const d = localISO(cursor, false);
        cursor.setDate(cursor.getDate() + 1);
        if (d === selectedDate) continue;
        if (narrower.some((er) => inRange(d, er))) continue;
        if (d >= floor) return d;
        if (pastOnly === null) pastOnly = d;
      }
      // Fall back to a past date only if the entire range is in the past
      // (e.g. an absolute "Last week" section).
      return pastOnly;
    }
    return null; // "unscheduled"
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
    // Resolve dragged tasks in their original list order so a multi-drag
    // preserves relative ordering at the drop site.
    const dragged = taskIds
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is Task => !!t)
      .sort((a, b) => a.order - b.order);
    if (dragged.length === 0) return;

    const newDate = targetDate(to);
    // Section drop with no viable date (e.g. range is just `selectedDate`
    // and fully covered by narrower sections) → cancel the drop rather
    // than silently landing somewhere unhelpful.
    if (to.startsWith("section:") && newDate === null) return;
    const writes: Array<{ id: string; text: string }> = [];
    for (const task of dragged) {
      const hadChip = explicitDate(task.text) !== null;
      const newText = hadChip ? setTaskDate(task.text, newDate) : task.text;
      if (newText !== task.text) writes.push({ id: task.id, text: newText });
      task.text = newText;
      task.date = newDate;
    }

    // Reorder within the destination date bucket. Insert the dragged group
    // as a contiguous run at the drop index.
    const draggedIds = new Set(dragged.map((t) => t.id));
    const bucket = tasks
      .filter((t) => !draggedIds.has(t.id) && effectiveDate(t) === newDate)
      .sort((a, b) => a.order - b.order);
    const at = Math.max(0, Math.min(index, bucket.length));
    bucket.splice(at, 0, ...dragged);
    bucket.forEach((t, i) => (t.order = i));

    tasks = [...tasks];

    await Promise.all(
      writes.map((w) =>
        api.tasks(w.id).$patch({ text: w.text, ...extractFields(w.text) }),
      ),
    );
    await api.tasks.reorder.$post({
      items: bucket.map((t) => ({ id: t.id, order: t.order, date: t.date })),
    });
  }

  async function handleAddTask(date: string, text: string) {
    const task = await api.tasks.$post({ text, date, ...extractFields(text) });
    tasks = [...tasks, task];
  }

  function submitNewTask(text: string) {
    void handleAddTask(selectedDate, text);
    addInput?.clear();
  }

  // Per-task monotonic sequence so rapid double-taps coalesce safely: only the
  // latest tap's outcome may write back to state. In-flight responses for
  // superseded taps are discarded, so we never overwrite a newer optimistic
  // flip with a stale server payload, and a failure on a stale request never
  // reverts the user's newer intent. `confirmedToggle` mirrors the last
  // server-acknowledged completed value so a rollback restores the truth on
  // the server rather than whatever optimistic state was visible at tap time.
  const toggleSeq = new Map<string, number>();
  const confirmedToggle = new Map<string, boolean>();

  async function handleToggleTask(task: Task) {
    const id = task.id;
    const target = !task.completed;
    if (!confirmedToggle.has(id)) confirmedToggle.set(id, task.completed);
    // Optimistic: flip the visual state immediately.
    tasks = tasks.map((t) => (t.id === id ? { ...t, completed: target } : t));
    const seq = (toggleSeq.get(id) ?? 0) + 1;
    toggleSeq.set(id, seq);
    try {
      const updated = await api.tasks(id).$patch({ completed: target });
      if (toggleSeq.get(id) !== seq) return; // superseded by a newer tap
      confirmedToggle.set(id, updated.completed);
      tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
      toggleSeq.delete(id);
    } catch {
      if (toggleSeq.get(id) !== seq) return; // newer tap is authoritative
      const safe = confirmedToggle.get(id) ?? !target;
      tasks = tasks.map((t) => (t.id === id ? { ...t, completed: safe } : t));
      toggleSeq.delete(id);
      toasts.error("Couldn't update task — please try again");
    }
  }

  async function handleDeleteTask(task: Task) {
    await api.tasks(task.id).$delete();
    tasks = tasks.filter((t) => t.id !== task.id);
  }

  async function handleEditTask(task: Task, text: string) {
    const updated = await api.tasks(task.id).$patch({ text, ...extractFields(text) });
    tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
  }

  async function handleDuplicateTask(task: Task) {
    const created = await api.tasks.$post({
      text: task.text,
      date: task.date,
      ...extractFields(task.text),
    });
    tasks = [...tasks, created];
  }

  // ---- Bulk actions on the current selection ------------------------------
  async function handleBulkDelete(ids: string[]) {
    const set = new Set(ids);
    tasks = tasks.filter((t) => !set.has(t.id));
    multi.clear();
    await Promise.all(ids.map((id) => api.tasks(id).$delete()));
  }

  async function handleBulkComplete(ids: string[], completed: boolean) {
    const set = new Set(ids);
    tasks = tasks.map((t) => (set.has(t.id) ? { ...t, completed } : t));
    await Promise.all(ids.map((id) => api.tasks(id).$patch({ completed })));
  }

  async function handleVoiceRecorded(file: File) {
    voiceLoading = true;
    voiceMessage = null;
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const result = await api.voice.transcribe.$post(formData);
      tasks = result.tasks;
      voiceMessage = result.message ?? null;
    } catch {
      voiceMessage = "Something went wrong processing that. Please try again.";
    } finally {
      voiceLoading = false;
    }
  }

  function handleVoiceError(message: string) {
    voiceMessage = message;
  }
</script>

<!-- Ambient glow behind the header area -->
<div class="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none
  bg-[radial-gradient(ellipse_at_center,var(--color-accent-glow)_0%,transparent_70%)] opacity-40"></div>

<main class="relative max-w-md mx-auto px-5 pt-24 pb-36 safe-top min-h-screen">
  <header class="flex items-center justify-between mb-10 animate-fade-up">
    <div>
      <h1 class="text-xl font-bold tracking-tight">Eos</h1>
      <p class="text-[11px] font-mono tracking-widest text-[var(--color-ink-3)] mt-0.5 uppercase">
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
      </p>
    </div>

    <div class="flex items-center gap-2">
      <AccountButton />
      <ThemeToggle />
      <button
        onclick={refresh}
        disabled={refreshing}
        aria-label="Reload"
        class="w-11 h-11 rounded-2xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]
          flex items-center justify-center transition-all duration-300 disabled:opacity-60"
      >
        <RotateCw size={17} class="text-[var(--color-ink-2)] {refreshing ? 'animate-spin' : ''}" />
      </button>
      {#if voiceLoading}
        <div class="w-11 h-11 rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center">
          <Loader2 size={18} class="animate-spin text-[var(--color-ink-2)]" />
        </div>
      {:else}
        <VoiceButton onRecorded={handleVoiceRecorded} onError={handleVoiceError} />
      {/if}
    </div>
  </header>

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

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 animate-fade-in">
      <Loader2 size={28} class="animate-spin text-[var(--color-ink-3)]" />
    </div>
  {:else}
    <FilterBar />
    <div class="space-y-8">
      <DailySection
        tasks={dailyTasks}
        bind:selectedDate
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onEditTask={handleEditTask}
        onDuplicateTask={handleDuplicateTask}
        onBulkDelete={handleBulkDelete}
        onBulkComplete={handleBulkComplete}
      />

      {#each sections.list as section (section.id)}
        <div class="border-t border-[var(--color-border)] mx-8"></div>
        <RangeSection
          {section}
          tasks={tasksBySection[section.id] ?? []}
          onEditSection={(s) => (editorFor = { section: s })}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onEditTask={handleEditTask}
          onDuplicateTask={handleDuplicateTask}
          onBulkDelete={handleBulkDelete}
          onBulkComplete={handleBulkComplete}
        />
      {/each}

      <div class="border-t border-[var(--color-border)] mx-8"></div>

      <UnscheduledSection
        tasks={unscheduledTasks}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onEditTask={handleEditTask}
        onDuplicateTask={handleDuplicateTask}
        onBulkDelete={handleBulkDelete}
        onBulkComplete={handleBulkComplete}
      />

      <button
        type="button"
        onclick={() => (editorFor = { section: null })}
        class="w-full flex items-center justify-center gap-2 h-11 rounded-2xl
          border border-dashed border-[var(--color-border)] text-[13px] font-medium
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)]
          hover:border-[var(--color-accent)]/40 transition-colors"
      >
        <Plus size={15} />
        Add section
      </button>
    </div>
  {/if}
</main>

{#if editorFor}
  <SectionEditor section={editorFor.section} onClose={() => (editorFor = null)} />
{/if}

{#if !loading}
  <!-- Always-on add-task bar pinned to the bottom of the viewport. Adds to the
       currently selected day (the DailySection's date picker controls that). -->
  <div
    class="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
  >
    <div
      class="max-w-md mx-auto px-5 pt-6 pointer-events-auto
        bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/95 to-transparent"
      style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));"
    >
      <div class="flex gap-2 items-start">
        <RichTaskInput
          bind:this={addInput}
          placeholder="What needs doing?  (@ for project, date, duration)"
          onsubmit={submitNewTask}
        />
        <button
          type="button"
          onclick={() => addInput?.submit()}
          aria-label="Add task"
          class="w-11 h-[46px] rounded-2xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]
            flex items-center justify-center transition-all duration-300 shrink-0
            hover:shadow-lg hover:shadow-[var(--color-accent-glow)] active:scale-95"
        >
          <Plus size={18} strokeWidth={2.5} class="text-[var(--color-bg)]" />
        </button>
      </div>
    </div>
  </div>
{/if}

<BoxSelect />

<Toast />

<!-- Drag ghost -->
{#if dnd.active}
  <div
    class="fixed z-50 pointer-events-none px-4 py-3.5 rounded-2xl bg-[var(--color-surface-2)]
      shadow-xl shadow-black/40 text-[13px] font-light tracking-wide text-[var(--color-ink)]
      border border-[var(--color-accent)]/30"
    style="left: {dnd.x}px; top: {dnd.y}px; width: {dnd.width}px;
      transform: translate(-28px, -50%);"
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
