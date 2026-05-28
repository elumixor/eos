<script lang="ts">
  import { ChevronLeft } from "lucide-svelte";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { projects } from "$lib/projects.svelte";
  import { extractFields, projectIds } from "$lib/tokens";
  import { isArchived } from "$lib/archive.svelte";
  import { toasts } from "$lib/toast.svelte";
  import type { Task } from "$lib/api";
  import TaskItem from "$lib/components/TaskItem.svelte";
  import { onMount } from "svelte";

  onMount(() => {
    void tasksStore.boot();
    void projects.boot();
  });

  const all = $derived(tasksStore.list);
  const filtered = $derived(
    all.filter((t) => {
      if (!isArchived(t)) return false;
      if (!projects.filterId) return true;
      const wanted = projects.descendantIds(projects.filterId);
      return projectIds(t.text).some((id) => wanted.has(id));
    }),
  );

  // Group by the calendar day of updatedAt (which is also the completion
  // timestamp when toggling done is the last write).
  type Group = { key: string; label: string; tasks: Task[] };
  const groups = $derived.by<Group[]>(() => {
    const byDay = new Map<string, Task[]>();
    for (const t of filtered) {
      const d = new Date(t.updatedAt as unknown as string);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = byDay.get(key) ?? [];
      arr.push(t);
      byDay.set(key, arr);
    }
    const keys = [...byDay.keys()].sort().reverse();
    const today = startOfDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return keys.map((k) => {
      const tasks = (byDay.get(k) ?? []).sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      );
      const [y, m, d] = k.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      let label: string;
      if (sameDay(date, today)) label = "Today";
      else if (sameDay(date, yesterday)) label = "Yesterday";
      else if (now() - date.getTime() < 7 * 86400_000)
        label = date.toLocaleDateString(undefined, { weekday: "long" });
      else if (date.getFullYear() === today.getFullYear())
        label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      else
        label = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return { key: k, label, tasks };
    });
  });

  function startOfDay(d: Date): Date {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }
  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function now() {
    return Date.now();
  }

  // Toggle uncompletes (Task moves back into a main bucket). Re-stamps
  // scheduledAt server-side via the existing bucket-change semantics if the
  // user later moves it. No-op stubs satisfy TaskItem's prop contract.
  async function handleToggleTask(task: Task) {
    try {
      await tasksStore.update(task.id, { completed: !task.completed });
    } catch {
      toasts.error("Couldn't update task — please try again");
    }
  }
  async function handleDeleteTask(task: Task) {
    await tasksStore.remove(task.id);
  }
  async function handleEditTask(task: Task, text: string) {
    await tasksStore.update(task.id, { text, ...extractFields(text) });
  }
  async function handleDuplicateTask(task: Task) {
    await tasksStore.create({ text: task.text, ...extractFields(task.text) });
  }
  async function handleBulkDelete(ids: string[]) {
    for (const id of ids) await tasksStore.remove(id);
  }
  async function handleBulkComplete(ids: string[], completed: boolean) {
    for (const id of ids) await tasksStore.update(id, { completed });
  }
</script>

<main class="relative max-w-md mx-auto px-5 pt-6 pb-12 safe-top min-h-screen">
  <header class="flex items-center gap-3 mb-6">
    <a
      href="/"
      aria-label="Back"
      class="shrink-0 leading-none text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
    >
      <ChevronLeft size={20} strokeWidth={1.75} />
    </a>
    <h1 class="text-[15px] font-medium tracking-wide text-[var(--color-ink)]">Archive</h1>
    <span class="ml-auto text-[12px] font-light text-[var(--color-ink-3)]">
      {filtered.length} item{filtered.length === 1 ? "" : "s"}
    </span>
  </header>

  {#if groups.length === 0}
    <p class="text-[13px] font-light text-[var(--color-ink-3)] mt-12 text-center">
      Nothing archived yet.
    </p>
  {:else}
    <div class="space-y-6">
      {#each groups as g (g.key)}
        {@const orderedIds = g.tasks.map((t) => t.id)}
        <section>
          <h2
            class="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-3)] mb-2 px-1"
          >
            {g.label}
          </h2>
          <ul class="space-y-1.5">
            {#each g.tasks as task, i (task.id)}
              <TaskItem
                {task}
                index={i}
                listId={`archive:${g.key}`}
                {orderedIds}
                onToggle={handleToggleTask}
                onDelete={handleDeleteTask}
                onEdit={handleEditTask}
                onDuplicate={handleDuplicateTask}
                onBulkDelete={handleBulkDelete}
                onBulkComplete={handleBulkComplete}
              />
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</main>
