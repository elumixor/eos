<script lang="ts">
  import { onMount } from "svelte";
  import { archivePop, isArchived } from "$lib/archive.svelte";
  import type { Task } from "$lib/api";
  import BottomComposer from "$lib/components/BottomComposer.svelte";
  import BoxSelect from "$lib/components/BoxSelect.svelte";
  import BucketSection from "$lib/components/BucketSection.svelte";
  import DragGhost from "$lib/components/DragGhost.svelte";
  import ProjectPicker from "$lib/components/ProjectPicker.svelte";
  import type RichTaskInput from "$lib/components/RichTaskInput.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import { dnd } from "$lib/dnd.svelte";
  import { commitDrop } from "$lib/home/drop";
  import { buildGlobalKeydown } from "$lib/home/keyboard";
  import { defaultHidden, HIDDEN_BUCKETS_KEY, SECTION_ORDER, SECTION_TITLE, type SectionKey } from "$lib/home/sections";
  import {
    addTask,
    bulkComplete,
    bulkDelete,
    deleteTask,
    duplicateTask,
    editTask,
    toggleTask,
  } from "$lib/home/task-handlers";
  import { projects } from "$lib/projects.svelte";
  import { ls } from "$lib/storage";
  import { tasks as tasksStore } from "$lib/tasks.svelte";
  import { displayBucket, projectIds } from "$lib/tokens";
  import { voiceTurn } from "$lib/voice-turn.svelte";

  const tasks = $derived(tasksStore.list);
  let voiceBubbleEl: HTMLDivElement | undefined = $state();
  let addInput: RichTaskInput | undefined = $state();
  let pickerOpen = $state(false);
  let hiddenBuckets = $state(defaultHidden());

  const matchesFilter = (t: Task) => {
    if (!projects.filterId) return true;
    const wanted = projects.descendantIds(projects.filterId);
    return projectIds(t.text).some((id) => wanted.has(id));
  };
  const visibleTasks = $derived(tasks.filter(matchesFilter));

  // Completed tasks that have rolled off live in archive; today/week keep
  // their own completed items so the dopamine of crossing-out sticks.
  const buckets = $derived.by(() => {
    const out: Record<SectionKey, Task[]> = { overdue: [], today: [], week: [], later: [] };
    for (const t of visibleTasks) {
      if (isArchived(t)) continue;
      out[displayBucket(t)].push(t);
    }
    return out;
  });
  const archivedCount = $derived(tasks.filter((t) => isArchived(t)).length);

  let popClass = $state("");
  let popTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (archivePop.tick === 0) return;
    popClass = "animate-archive-pop";
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(() => (popClass = ""), 450);
  });

  const draggedTask = $derived(dnd.taskId ? tasks.find((t) => t.id === dnd.taskId) : undefined);

  onMount(() => {
    void tasksStore.boot();
    void projects.boot();
    void loadHiddenBuckets();
    dnd.onDrop = (e) => commitDrop(e, tasks);
    const onKey = buildGlobalKeydown({
      onUndo: () => void voiceTurn.undo(),
      onRedo: () => void voiceTurn.redo(),
      canUndo: () => voiceTurn.canUndo,
      canRedo: () => voiceTurn.canRedo,
      togglePicker: () => (pickerOpen = !pickerOpen),
    });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onOutsidePointerDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  });

  async function loadHiddenBuckets() {
    try {
      const raw = await ls.get(HIDDEN_BUCKETS_KEY);
      if (raw) hiddenBuckets = { ...hiddenBuckets, ...(JSON.parse(raw) as Partial<Record<SectionKey, boolean>>) };
    } catch {
      // stale preference — fall back to defaults
    }
  }

  // Skip dismiss while loading/recording so an in-flight response isn't aborted.
  function onOutsidePointerDown(e: PointerEvent) {
    if (!voiceTurn.message || voiceTurn.loading || voiceTurn.recording) return;
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (voiceBubbleEl?.contains(target)) return;
    if ((target as Element).closest?.("[data-voice-keep]")) return;
    voiceTurn.dismiss();
  }

  function onWindowBlur() {
    if (voiceTurn.loading || voiceTurn.recording) return;
    if (voiceTurn.message) voiceTurn.dismiss();
  }

  const persistHidden = () => void ls.set(HIDDEN_BUCKETS_KEY, JSON.stringify(hiddenBuckets));

  function submitNewTask(text: string) {
    void addTask(text);
    addInput?.clear();
  }

  async function onVoiceRecorded(file: File) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await voiceTurn.record(file, today, now.getTimezoneOffset());
  }
</script>

<div
  class="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none
    bg-[radial-gradient(ellipse_at_center,var(--color-accent-glow)_0%,transparent_70%)] opacity-40"
></div>

<TopBar {archivedCount} {popClass} />

<main
  class="relative max-w-md mx-auto px-5 pb-36 min-h-screen"
  style="padding-top: calc(env(safe-area-inset-top, 0px) + 4.5rem);"
>
  <div class="space-y-5">
    {#each SECTION_ORDER as key (key)}
      {#if key !== "overdue" || buckets[key].length > 0}
        <BucketSection
          title={SECTION_TITLE[key]}
          listId={`bucket:${key}`}
          tasks={buckets[key]}
          bind:hidden={hiddenBuckets[key]}
          onToggleHidden={persistHidden}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onEditTask={editTask}
          onDuplicateTask={duplicateTask}
          onBulkDelete={bulkDelete}
          onBulkComplete={bulkComplete}
        />
      {/if}
    {/each}
  </div>
</main>

{#if pickerOpen}
  <ProjectPicker onClose={() => (pickerOpen = false)} />
{/if}

<BottomComposer bind:input={addInput} bind:bubble={voiceBubbleEl} onSubmit={submitNewTask} {onVoiceRecorded} />

<BoxSelect />
<Toast />
<DragGhost task={draggedTask} />
