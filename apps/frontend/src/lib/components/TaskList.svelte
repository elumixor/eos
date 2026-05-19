<script lang="ts">
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import TaskItem from "./TaskItem.svelte";

  let {
    tasks,
    listId,
    emptyHint,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
    onBulkDelete,
    onBulkComplete,
  }: {
    tasks: Task[];
    listId: string;
    emptyHint?: string;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  const isOver = $derived(dnd.active && dnd.overList === listId);
  // Push completed tasks to the bottom (most recently checked first within
  // the done group) while preserving the caller's order for the rest.
  const sorted = $derived.by(() => {
    const pending: Task[] = [];
    const done: Task[] = [];
    for (const t of tasks) (t.completed ? done : pending).push(t);
    done.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return [...pending, ...done];
  });
  // Index within the list excluding any items being dragged.
  const visible = $derived(sorted.filter((t) => !dnd.has(t.id)));
  const orderedIds = $derived(visible.map((t) => t.id));
</script>

<ul
  data-dnd-list={listId}
  class="space-y-1.5 min-h-[8px] rounded-2xl transition-colors duration-200
    {isOver ? 'outline-2 outline-dashed outline-[var(--color-accent)]/40 outline-offset-4' : ''}"
>
  {#each visible as task, i (task.id)}
    {#if isOver && dnd.overIndex === i}
      <li class="h-11 rounded-2xl bg-[var(--color-accent-dim)] border border-dashed border-[var(--color-accent)]/40"></li>
    {/if}
    <TaskItem
      {task}
      index={i}
      {listId}
      {orderedIds}
      onToggle={onToggleTask}
      onDelete={onDeleteTask}
      onEdit={onEditTask}
      onDuplicate={onDuplicateTask}
      {onBulkDelete}
      {onBulkComplete}
    />
  {/each}

  {#if isOver && dnd.overIndex >= visible.length}
    <li class="h-11 rounded-2xl bg-[var(--color-accent-dim)] border border-dashed border-[var(--color-accent)]/40"></li>
  {/if}

  {#if visible.length === 0 && !isOver && emptyHint}
    <li class="px-4 py-3 text-[12px] text-[var(--color-ink-3)] font-light">{emptyHint}</li>
  {/if}
</ul>
