<script lang="ts">
  import { Plus, CalendarDays, ChevronLeft, ChevronRight } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { localISO } from "$lib/tokens";
  import SectionShell from "./SectionShell.svelte";
  import TaskList from "./TaskList.svelte";
  import RichTaskInput from "./RichTaskInput.svelte";

  let {
    tasks,
    selectedDate = $bindable(),
    onAddTask,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
  }: {
    tasks: Task[];
    selectedDate: string;
    onAddTask: (date: string, text: string) => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
  } = $props();

  let addInput: RichTaskInput | undefined = $state();
  let dateInput: HTMLInputElement | undefined = $state();
  let collapsed = $state(false);

  const today = localISO(new Date(), false);

  function shift(days: number) {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    selectedDate = localISO(d, false);
  }

  function label(dateStr: string) {
    if (dateStr === today) return "Today";
    const d = new Date(`${dateStr}T12:00:00`);
    const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const completedCount = $derived(tasks.filter((t) => t.completed).length);

  function submitNew(text: string) {
    onAddTask(selectedDate, text);
    addInput?.clear();
  }

  // Horizontal swipe on the header switches days (touch + mouse).
  let swipeX = 0;
  let swiping = false;
  function onPointerDown(e: PointerEvent) {
    if (dnd.active) return;
    swipeX = e.clientX;
    swiping = true;
  }
  function onPointerUp(e: PointerEvent) {
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - swipeX;
    if (Math.abs(dx) > 50) shift(dx < 0 ? 1 : -1);
  }
</script>

<div
  role="group"
  aria-label="Daily tasks"
  onpointerdown={onPointerDown}
  onpointerup={onPointerUp}
  style="touch-action: pan-y;"
>
  <SectionShell
    bind:collapsed
    {completedCount}
    totalCount={tasks.length}
  >
    {#snippet header()}
      <div class="flex items-center gap-1 flex-1 min-w-0">
        <button
          type="button"
          aria-label="Previous day"
          onclick={(e) => { e.stopPropagation(); shift(-1); }}
          class="w-7 h-7 -ml-1 rounded-lg flex items-center justify-center text-[var(--color-ink-3)]
            hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 class="text-base font-semibold tracking-tight truncate min-w-0">{label(selectedDate)}</h2>
        <button
          type="button"
          aria-label="Next day"
          onclick={(e) => { e.stopPropagation(); shift(1); }}
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-ink-3)]
            hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors shrink-0"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    {/snippet}

    {#snippet actions()}
      {#if selectedDate !== today}
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); selectedDate = today; }}
          class="px-2.5 h-7 rounded-lg text-[11px] font-medium bg-[var(--color-surface-2)]
            hover:bg-[var(--color-surface-3)] text-[var(--color-ink-2)] transition-colors shrink-0"
        >
          Today
        </button>
      {/if}
      <button
        type="button"
        aria-label="Pick a date"
        onclick={(e) => { e.stopPropagation(); dateInput?.showPicker?.(); }}
        class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-ink-3)]
          hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors shrink-0 relative"
      >
        <CalendarDays size={15} />
        <input
          bind:this={dateInput}
          type="date"
          value={selectedDate}
          onchange={(e) => (selectedDate = (e.target as HTMLInputElement).value || selectedDate)}
          class="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
        />
      </button>
    {/snippet}

    <TaskList
      tasks={tasks.slice().sort((a, b) => a.order - b.order)}
      listId={`daily:${selectedDate}`}
      {onToggleTask}
      {onDeleteTask}
      {onEditTask}
      {onDuplicateTask}
    />

    <div class="flex gap-2 mt-3 items-start">
      <RichTaskInput
        bind:this={addInput}
        placeholder="What needs doing?  (@ for project, date, duration)"
        onsubmit={submitNew}
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
  </SectionShell>
</div>
