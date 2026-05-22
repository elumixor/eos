<script lang="ts">
  import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { localISO } from "$lib/tokens";
  import SectionShell from "./SectionShell.svelte";
  import TaskList from "./TaskList.svelte";

  let {
    tasks,
    selectedDate = $bindable(),
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
    onBulkDelete,
    onBulkComplete,
  }: {
    tasks: Task[];
    selectedDate: string;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

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

  // Horizontal swipe on the header switches days (touch only). Mouse users
  // page the day with the chevrons; the swipe gesture would otherwise compete
  // with marquee box-selection.
  //
  // Axis-lock state machine: on the first dominant movement past AXIS_LOCK_PX
  // we commit to either "swipe" (horizontal — day shifts) or "scroll"
  // (vertical — gesture ignored, page scrolls natively via touch-action:
  // pan-y). Once committed there is no mid-gesture switching, so a vertical
  // scroll that drifts sideways can never paginate the day, and a horizontal
  // swipe that drifts vertically still commits the day on release.
  const AXIS_LOCK_PX = 6; // first move past this commits the axis
  const COMMIT_PX = 40; // total horizontal distance required to shift a day
  type SwipeLock = null | "swipe" | "scroll";
  let swipeX = 0;
  let swipeY = 0;
  let swipeLock: SwipeLock = null;
  let swiping = false;
  let swipePointerId: number | null = null;
  function onPointerDown(e: PointerEvent) {
    if (dnd.active || e.pointerType !== "touch") return;
    // Already tracking another finger — ignore the new pointer entirely so a
    // second touch can't rewrite the origin mid-swipe.
    if (swiping) return;
    swipePointerId = e.pointerId;
    swipeX = e.clientX;
    swipeY = e.clientY;
    swipeLock = null;
    swiping = true;
  }
  function onPointerMove(e: PointerEvent) {
    if (!swiping || e.pointerId !== swipePointerId || swipeLock !== null) return;
    const dx = e.clientX - swipeX;
    const dy = e.clientY - swipeY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < AXIS_LOCK_PX && ay < AXIS_LOCK_PX) return;
    // Whichever axis crosses the threshold first wins. Require horizontal to
    // be clearly dominant to avoid hijacking a near-vertical swipe.
    swipeLock = ax > ay * 1.2 ? "swipe" : "scroll";
  }
  function onPointerUp(e: PointerEvent) {
    if (!swiping || e.pointerId !== swipePointerId) return;
    const lock = swipeLock;
    swiping = false;
    swipeLock = null;
    swipePointerId = null;
    if (lock !== "swipe") return;
    const dx = e.clientX - swipeX;
    if (Math.abs(dx) > COMMIT_PX) shift(dx < 0 ? 1 : -1);
  }
  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== swipePointerId) return;
    swiping = false;
    swipeLock = null;
    swipePointerId = null;
  }
</script>

<div
  role="group"
  aria-label="Daily tasks"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
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
      {onBulkDelete}
      {onBulkComplete}
    />
  </SectionShell>
</div>
