<script lang="ts">
  import { Eye, EyeOff } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import TaskList from "./TaskList.svelte";

  let {
    title,
    listId,
    tasks,
    hidden = $bindable(false),
    onToggleHidden,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
    onBulkDelete,
    onBulkComplete,
  }: {
    title: string;
    listId: string;
    tasks: Task[];
    hidden?: boolean;
    onToggleHidden?: (hidden: boolean) => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  const total = $derived(tasks.length);
  const done = $derived(tasks.filter((t) => t.completed).length);
  const pct = $derived(total === 0 ? 0 : Math.round((done / total) * 100));

  // Donut geometry. 14px radius circle, 2px stroke. Circumference = 2πr.
  const R = 7;
  const C = 2 * Math.PI * R;
  const dashOffset = $derived(C * (1 - pct / 100));

  // Drop hover for the whole section (title row + list). dnd.overList is set
  // by either the inner TaskList or the title row's own data-dnd-list.
  const isOver = $derived(dnd.active && dnd.overList === listId);

  function toggle() {
    hidden = !hidden;
    onToggleHidden?.(hidden);
  }
</script>

<section class="animate-fade-up">
  <div
    data-dnd-list={listId}
    role="button"
    tabindex="0"
    aria-label={hidden ? `Show ${title}` : `Hide ${title}`}
    aria-pressed={!hidden}
    onclick={toggle}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    }}
    class="flex items-center gap-2 mb-2 px-1 py-1 rounded-lg transition-colors cursor-pointer select-none
      hover:bg-[var(--color-surface-2)]
      {isOver ? 'bg-[var(--color-accent-dim)]' : ''}"
  >
    <h2 class="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
      {title}
    </h2>

    {#if total > 0}
      <span class="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-ink-3)]">
        <svg width={2 * R + 4} height={2 * R + 4} viewBox="0 0 {2 * R + 4} {2 * R + 4}" class="shrink-0">
          <circle
            cx={R + 2}
            cy={R + 2}
            r={R}
            fill="none"
            stroke="var(--color-border)"
            stroke-width="2"
          />
          <circle
            cx={R + 2}
            cy={R + 2}
            r={R}
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray={C}
            stroke-dashoffset={dashOffset}
            transform="rotate(-90 {R + 2} {R + 2})"
            style="transition: stroke-dashoffset 200ms ease-out;"
          />
        </svg>
        <span>{pct}%</span>
      </span>
    {/if}

    <span
      aria-hidden="true"
      class="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-ink-3)]"
    >
      {#if hidden}
        <EyeOff size={13} />
      {:else}
        <Eye size={13} />
      {/if}
    </span>
  </div>

  {#if !hidden}
    <TaskList
      tasks={tasks.slice().sort((a, b) => a.order - b.order)}
      {listId}
      {onToggleTask}
      {onDeleteTask}
      {onEditTask}
      {onDuplicateTask}
      {onBulkDelete}
      {onBulkComplete}
    />
  {/if}
</section>
