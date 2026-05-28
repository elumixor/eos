<script lang="ts">
  import { flip } from "svelte/animate";
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
  // While a drag is over this list, slot the dragged task at the current
  // drop index so it visually IS the placeholder. This keeps the dragged
  // task's <li> in the keyed each, so animate:flip can interpolate
  // neighbours toward their new positions instead of snapping, and we
  // avoid a separate placeholder element that would push items down and
  // throw off the pointer hit-test.
  const visible = $derived.by(() => {
    if (!dnd.active) return sorted;
    const withoutDragged = sorted.filter((t) => !dnd.has(t.id));
    if (!isOver) return withoutDragged;
    const draggedItems = sorted.filter((t) => dnd.has(t.id));
    const at = Math.min(Math.max(0, dnd.overIndex), withoutDragged.length);
    withoutDragged.splice(at, 0, ...draggedItems);
    return withoutDragged;
  });
  const orderedIds = $derived(visible.filter((t) => !dnd.has(t.id)).map((t) => t.id));
</script>

<ul
  data-dnd-list={listId}
  class="relative space-y-1.5 min-h-[8px] rounded-2xl transition-colors duration-200
    {isOver ? 'outline-2 outline-dashed outline-[var(--color-accent)]/40 outline-offset-4' : ''}"
>
  {#each visible as task, i (task.id)}
    <li animate:flip={{ duration: 220 }}>
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
    </li>
  {/each}

  {#if visible.length === 0 && !isOver && emptyHint}
    <li class="px-4 py-3 text-[12px] text-[var(--color-ink-3)] font-light">{emptyHint}</li>
  {/if}
</ul>
