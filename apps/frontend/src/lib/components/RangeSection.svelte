<script lang="ts">
  import { Pencil } from "lucide-svelte";
  import type { Section, Task } from "$lib/api";
  import { effectiveDate } from "$lib/tokens";
  import { sections } from "$lib/sections.svelte";
  import SectionShell from "./SectionShell.svelte";
  import TaskList from "./TaskList.svelte";

  // `tasks` MUST be the section's pre-bucketed list (mutually exclusive
  // across range sections + already excludes the Daily-selected date).
  // The parent owns that filtering; this component just sorts and renders.
  let {
    section,
    tasks,
    onEditSection,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    onDuplicateTask,
    onBulkDelete,
    onBulkComplete,
  }: {
    section: Section;
    tasks: Task[];
    onEditSection: (section: Section) => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  const sectionTasks = $derived(
    tasks.slice().sort((a, b) => {
      const da = effectiveDate(a) ?? "";
      const db = effectiveDate(b) ?? "";
      return da === db ? a.order - b.order : da < db ? -1 : 1;
    }),
  );
  const completedCount = $derived(sectionTasks.filter((t) => t.completed).length);

  let collapsed = $state(section.collapsed);
</script>

<SectionShell
  title={section.name}
  bind:collapsed
  {completedCount}
  totalCount={sectionTasks.length}
  onToggleCollapsed={(c) => sections.update(section.id, { collapsed: c })}
>
  {#snippet actions()}
    <button
      type="button"
      aria-label="Edit section"
      onclick={(e) => { e.stopPropagation(); onEditSection(section); }}
      class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-ink-3)]
        hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors shrink-0
        opacity-0 group-hover/header:opacity-100"
    >
      <Pencil size={14} />
    </button>
  {/snippet}

  <TaskList
    tasks={sectionTasks}
    listId={`section:${section.id}`}
    emptyHint="Drag tasks here"
    {onToggleTask}
    {onDeleteTask}
    {onEditTask}
    {onDuplicateTask}
    {onBulkDelete}
    {onBulkComplete}
  />
</SectionShell>
