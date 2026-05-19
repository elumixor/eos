<script lang="ts">
  import type { Task } from "$lib/api";
  import SectionShell from "./SectionShell.svelte";
  import TaskList from "./TaskList.svelte";

  let {
    tasks,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
  }: {
    tasks: Task[];
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
  } = $props();

  const ordered = $derived(tasks.slice().sort((a, b) => a.order - b.order));
  const completedCount = $derived(ordered.filter((t) => t.completed).length);
  let collapsed = $state(true);
</script>

<SectionShell
  title="Unscheduled"
  bind:collapsed
  {completedCount}
  totalCount={ordered.length}
>
  <TaskList
    tasks={ordered}
    listId="unscheduled"
    emptyHint="Drag tasks here to unschedule them"
    {onToggleTask}
    {onDeleteTask}
    {onEditTask}
    {onDuplicateTask}
  />
</SectionShell>
