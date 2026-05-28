<script lang="ts">
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import { notifySuccess, notifyWarning, tapLight, tapMedium } from "$lib/haptics";
  import { selection as multi } from "$lib/selection.svelte";
  import { stripTokens } from "$lib/tokens";
  import RichTaskInput from "./RichTaskInput.svelte";
  import ConfirmDelete from "./task-item/ConfirmDelete.svelte";
  import { createGesture } from "./task-item/pointer-gesture";
  import TaskActionMenu from "./task-item/TaskActionMenu.svelte";
  import TaskCheckbox from "./task-item/TaskCheckbox.svelte";
  import TaskContent from "./TaskContent.svelte";

  let {
    task,
    index,
    listId,
    orderedIds,
    onToggle,
    onDelete,
    onEdit,
    onDuplicate,
    onBulkDelete,
    onBulkComplete,
  }: {
    task: Task;
    index: number;
    listId: string;
    /** All task ids in this list, in render order — used for shift-range. */
    orderedIds: string[];
    onToggle: (task: Task) => void;
    onDelete: (task: Task) => void;
    onEdit: (task: Task, text: string) => void;
    onDuplicate: (task: Task) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkComplete: (ids: string[], completed: boolean) => void;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  let mainEl: HTMLDivElement | undefined = $state();
  const isDragging = $derived(dnd.has(task.id));
  const isSelected = $derived(multi.has(task.id));
  // Entry fade only fires on mount. Without this gate, a drop (which toggles
  // isDragging false → reveals the row) would replay the fade-up.
  let mounted = $state(false);
  $effect(() => {
    mounted = true;
  });

  let editing = $state(false);
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let bulkCtx = $state(false);
  let taskRect = $state<{ left: number; top: number; width: number; height: number } | null>(null);
  let confirmDelete = $state(false);
  let confirmBulk = $state(false);

  const startEdit = () => (editing = true);

  function navigateTab(dir: 1 | -1) {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-dnd-item]"));
    const idx = el ? all.indexOf(el) : -1;
    all[idx + dir]?.dispatchEvent(new CustomEvent("eos-edit-task", { bubbles: false }));
  }

  $effect(() => {
    if (!el) return;
    const handler = () => (editing = true);
    el.addEventListener("eos-edit-task", handler);
    return () => el?.removeEventListener("eos-edit-task", handler);
  });

  function onStripKeydown(e: KeyboardEvent) {
    if (editing || e.key !== "Tab") return;
    e.preventDefault();
    navigateTab(e.shiftKey ? -1 : 1);
  }

  function commitEdit(text: string) {
    const trimmed = text.trim();
    if (trimmed && trimmed !== task.text) onEdit(task, trimmed);
    editing = false;
  }

  function openMenu(x: number, y: number) {
    menuX = x;
    menuY = y;
    if (el) {
      const r = el.getBoundingClientRect();
      taskRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    menuOpen = true;
    tapMedium();
  }

  const gesture = createGesture({
    shouldIgnore: (e) => editing || !!(e.target as HTMLElement).closest("[data-task-checkbox]"),
    startDrag(x, y, pid) {
      const ids = multi.has(task.id) && multi.size > 1 ? multi.list : [task.id];
      const label = ids.length > 1 ? `${ids.length} tasks` : task.text;
      const r = el?.getBoundingClientRect();
      const w = r?.width ?? el?.clientWidth ?? 320;
      if (!dnd.start(ids, label, listId, { clientX: x, clientY: y }, w, r)) return;
      tapLight();
      mainEl?.releasePointerCapture?.(pid);
    },
    openLongPressMenu() {
      bulkCtx = multi.has(task.id) && multi.size > 1;
      const r = el?.getBoundingClientRect();
      openMenu(r ? r.left + r.width / 2 : 0, r ? r.bottom : 0);
    },
    closeLongPressMenu: () => (menuOpen = false),
    tap({ shift, meta }) {
      if (shift) return multi.rangeFromAnchor(orderedIds, task.id, listId);
      if (meta) return multi.toggle(task.id, listId);
      if (multi.active) multi.clear();
      startEdit();
    },
    onPointerCapture: (pid) => mainEl?.releasePointerCapture?.(pid),
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    bulkCtx = multi.has(task.id) && multi.size > 1;
    openMenu(e.clientX, e.clientY);
  }

  function askDelete() {
    menuOpen = false;
    confirmBulk = bulkCtx;
    confirmDelete = true;
  }

  function doDelete() {
    confirmDelete = false;
    notifyWarning();
    if (confirmBulk) onBulkDelete(multi.list);
    else onDelete(task);
  }

  function handleToggle() {
    const willComplete = !task.completed;
    onToggle(task);
    setTimeout(() => (willComplete ? notifySuccess() : tapLight()), 0);
  }
</script>

<div
  bind:this={el}
  data-dnd-item={task.id}
  class="group relative rounded-2xl
    {isSelected ? 'outline outline-2 outline-[var(--color-accent)]' : ''}
    {!mounted ? 'animate-fade-up' : ''}
    {menuOpen ? 'invisible' : ''}"
  style="animation-delay: {index * 50}ms"
  oncontextmenu={handleContextMenu}
  role="listitem"
>
  <div
    bind:this={mainEl}
    class="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl no-touch-select
      outline outline-2 -outline-offset-2 transition-[outline-color,background-color] duration-200
      {isDragging
        ? 'bg-[var(--color-accent-dim)] outline-dashed outline-[var(--color-accent)]/40'
        : editing
          ? 'bg-[var(--color-surface-2)] outline-[var(--color-accent)]'
          : task.completed
            ? 'bg-[var(--color-done)] outline-transparent'
            : 'bg-[var(--color-surface)] outline-transparent'}"
    style="touch-action: pan-y;"
    role="textbox"
    tabindex="0"
    onpointerdown={gesture.onDown}
    onpointermove={gesture.onMove}
    onpointerup={gesture.onUp}
    onpointercancel={gesture.onCancel}
    onkeydown={onStripKeydown}
  >
    {#if editing}
      <RichTaskInput
        value={task.text}
        autofocus
        submitOnBlur
        flush
        placeholder="Edit task"
        onsubmit={commitEdit}
        onTabNav={navigateTab}
      />
    {:else}
      <div class="flex-1 min-w-0 {isDragging ? 'invisible' : ''}">
        <TaskContent {task} dimmed={task.completed} />
      </div>
    {/if}
  </div>

  <TaskCheckbox completed={task.completed} hidden={isDragging} onToggle={handleToggle} />
</div>

{#if menuOpen}
  <TaskActionMenu
    {task}
    x={menuX}
    y={menuY}
    bulk={bulkCtx}
    rect={taskRect}
    {isSelected}
    onClose={() => (menuOpen = false)}
    onEdit={startEdit}
    onDuplicate={() => onDuplicate(task)}
    onDelete={askDelete}
    onBulkComplete={(target) => onBulkComplete(multi.list, target)}
  />
{/if}

{#if confirmDelete}
  <ConfirmDelete
    bulk={confirmBulk}
    detail={stripTokens(task.text)}
    onCancel={() => (confirmDelete = false)}
    onConfirm={doDelete}
  />
{/if}
