<script lang="ts">
  import { Pencil } from "lucide-svelte";
  import type { Section, Task } from "$lib/api";
  import { effectiveDate, inRange, resolveRange } from "$lib/tokens";
  import { sections } from "$lib/sections.svelte";
  import SectionShell from "./SectionShell.svelte";
  import TaskList from "./TaskList.svelte";

  let {
    section,
    tasks,
    excludeDate,
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
    excludeDate?: string | null;
    onEditSection: (section: Section) => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask: (task: Task, text: string) => void;
    onDuplicateTask: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  const range = $derived(resolveRange(section));
  const sectionTasks = $derived(
    tasks
      .filter((t) => {
        const d = effectiveDate(t);
        if (d === null || !inRange(d, range)) return false;
        // Model B: a task already visible in the Daily section for the
        // selected date should not also appear in any range section.
        if (excludeDate && d === excludeDate) return false;
        return true;
      })
      .sort((a, b) => {
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
