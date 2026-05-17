<script lang="ts">
  import { Plus, ChevronDown, ChevronUp } from "lucide-svelte";
  import type { Day, Task } from "$lib/api";
  import { projects } from "$lib/projects.svelte";
  import { projectIds } from "$lib/tokens";
  import TaskList from "./TaskList.svelte";
  import RichTaskInput from "./RichTaskInput.svelte";

  let {
    day,
    isToday,
    onAddTask,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
  }: {
    day: Day;
    isToday: boolean;
    onAddTask: (dayId: string, text: string) => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
  } = $props();

  let collapsed = $state(!isToday);
  let addInput: RichTaskInput | undefined = $state();

  function submitNew(text: string) {
    onAddTask(day.id, text);
    addInput?.clear();
  }

  const dayTasks = $derived(
    day.tasks
      .filter(
        (t) =>
          !t.thisWeek &&
          (!projects.filterId || projectIds(t.text).includes(projects.filterId)),
      )
      .sort((a, b) => a.order - b.order),
  );
  const completedCount = $derived(dayTasks.filter((t) => t.completed).length);
  const totalCount = $derived(dayTasks.length);
  const progress = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
  const allDone = $derived(totalCount > 0 && completedCount === totalCount);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
</script>

<section class="animate-fade-up">
  <!-- Header -->
  <button
    class="w-full flex items-center gap-3 mb-3 group/header cursor-pointer"
    onclick={() => !isToday && (collapsed = !collapsed)}
  >
    <div class="flex-1 flex items-center gap-3">
      <h2 class="text-base font-semibold tracking-tight">
        {#if isToday}
          Today
        {:else}
          {formatDate(day.date)}
        {/if}
      </h2>

      {#if totalCount > 0}
        <span class="font-mono text-[11px] tracking-wider text-[var(--color-ink-3)]
          {allDone ? 'text-[var(--color-accent)]' : ''}">
          {completedCount}/{totalCount}
        </span>
      {/if}
    </div>

    {#if !isToday}
      <div class="text-[var(--color-ink-3)] opacity-0 group-hover/header:opacity-100 transition-opacity">
        {#if collapsed}
          <ChevronDown size={16} />
        {:else}
          <ChevronUp size={16} />
        {/if}
      </div>
    {/if}
  </button>

  <!-- Progress bar -->
  {#if totalCount > 0 && !collapsed}
    <div class="progress-track mb-4">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
  {/if}

  <!-- Tasks -->
  {#if !collapsed}
    <TaskList
      tasks={dayTasks}
      listId={day.id}
      {onToggleTask}
      {onDeleteTask}
      {onEditTask}
      {onDuplicateTask}
    />

    <!-- Add task input -->
    {#if isToday}
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
    {/if}
  {/if}
</section>
