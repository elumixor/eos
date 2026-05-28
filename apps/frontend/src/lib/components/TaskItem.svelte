<script lang="ts">
  import { Check, Trash2, Pencil, Copy, Undo2 } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { stripTokens } from "$lib/tokens";
  import { dnd } from "$lib/dnd.svelte";
  import { selection as multi } from "$lib/selection.svelte";
  import { notifySuccess, notifyWarning, tapLight, tapMedium } from "$lib/haptics";
  import TaskContent from "./TaskContent.svelte";
  import RichTaskInput from "./RichTaskInput.svelte";

  // Move a node to <body> so `position: fixed` resolves against the viewport.
  // Task rows keep a `transform` (animate-fade-up, fill-mode: both), which
  // would otherwise become the containing block for the fixed menu.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

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

  let el: HTMLLIElement | undefined = $state();
  let mainEl: HTMLDivElement | undefined = $state();
  const isDragging = $derived(dnd.has(task.id));
  const isSelected = $derived(multi.has(task.id));

  let editing = $state(false);

  function startEdit() {
    editing = true;
  }

  // ---- Tab navigation ------------------------------------------------------
  function navigateTab(dir: 1 | -1) {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-dnd-item]"));
    const idx = el ? all.indexOf(el) : -1;
    const next = all[idx + dir];
    if (!next) return;
    next.dispatchEvent(new CustomEvent("eos-edit-task", { bubbles: false }));
  }

  $effect(() => {
    if (!el) return;
    const handler = () => {
      editing = true;
    };
    el.addEventListener("eos-edit-task", handler);
    return () => el?.removeEventListener("eos-edit-task", handler);
  });

  function onStripKeydown(e: KeyboardEvent) {
    if (editing) return;
    if (e.key !== "Tab") return;
    e.preventDefault();
    navigateTab(e.shiftKey ? -1 : 1);
  }

  function commitEdit(text: string) {
    const trimmed = text.trim();
    if (trimmed && trimmed !== task.text) onEdit(task, trimmed);
    editing = false;
  }

  // ---- Pointer pipeline ----------------------------------------------------
  // Web (mouse): pointerdown + any movement → start drag. pointerup with no
  // movement → edit. Right-click → context menu.
  // Mobile (touch/pen): long-press (450ms held still) → open context menu and
  // arm drag. After arming, any movement closes the menu and starts the drag.
  // A plain tap (no long-press) → edit.

  let active = false;
  let hadDown = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpFired = false; // long-press menu opened on this gesture
  let pointerType: string = "mouse";
  let modShift = false;
  let modMeta = false;

  // iOS only honours preventDefault on the *first* touchmove of a gesture,
  // so the scroll blocker must be installed at pointerdown — before any
  // movement — to keep the page from panning out from under a long-press.
  let blockTouchActive = false;
  const blockTouch = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault();
  };
  function armScrollBlocker() {
    if (blockTouchActive) return;
    window.addEventListener("touchmove", blockTouch, { passive: false });
    blockTouchActive = true;
  }
  function disarmScrollBlocker() {
    if (!blockTouchActive) return;
    window.removeEventListener("touchmove", blockTouch);
    blockTouchActive = false;
  }

  function clearLp() {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }

  function startReorder(x: number, y: number, pid: number) {
    const ids = multi.has(task.id) && multi.size > 1 ? multi.list : [task.id];
    const label = ids.length > 1 ? `${ids.length} tasks` : task.text;
    const r = el?.getBoundingClientRect();
    const w = r?.width ?? el?.clientWidth ?? 320;
    disarmScrollBlocker();
    if (!dnd.start(ids, label, listId, { clientX: x, clientY: y }, w, r)) return;
    tapLight();
    mainEl?.releasePointerCapture?.(pid);
  }

  function onDown(e: PointerEvent) {
    e.stopPropagation();
    if (editing || e.button === 2) return;
    // Ignore presses on interactive children (checkbox button).
    const target = e.target as HTMLElement;
    if (target.closest("[data-task-checkbox]")) return;

    active = true;
    hadDown = true;
    lpFired = false;
    pointerType = e.pointerType;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    modShift = e.shiftKey;
    modMeta = e.metaKey || e.ctrlKey;
    clearLp();

    if (e.pointerType !== "mouse") {
      armScrollBlocker();
      lpTimer = setTimeout(() => {
        if (!active) return;
        lpFired = true;
        bulkCtx = multi.has(task.id) && multi.size > 1;
        const r = el?.getBoundingClientRect();
        const mx = r ? r.left + r.width / 2 : lastX;
        const my = r ? r.bottom : lastY;
        openMenu(mx, my);
      }, 450);
    }
  }

  function onMove(e: PointerEvent) {
    if (!active) return;
    lastX = e.clientX;
    lastY = e.clientY;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const moved = Math.abs(dx) > 5 || Math.abs(dy) > 5;
    if (!moved) return;

    if (e.pointerType === "mouse") {
      // Web: any movement starts drag immediately.
      active = false;
      startReorder(e.clientX, e.clientY, e.pointerId);
      return;
    }

    // Touch/pen: movement before long-press → scroll (let the browser pan).
    if (!lpFired) {
      active = false;
      clearLp();
      disarmScrollBlocker();
      return;
    }

    // Touch/pen after long-press: movement closes the menu and starts drag.
    active = false;
    menuOpen = false;
    startReorder(e.clientX, e.clientY, e.pointerId);
  }

  function onUp(e: PointerEvent) {
    const wasDown = hadDown;
    const wasLp = lpFired;
    active = false;
    hadDown = false;
    lpFired = false;
    clearLp();
    disarmScrollBlocker();
    mainEl?.releasePointerCapture?.(e.pointerId);
    if (!wasDown) return;
    const moved = Math.abs(lastX - startX) > 6 || Math.abs(lastY - startY) > 6;
    if (moved) return;
    if (wasLp) return; // long-press already opened the menu; tap-up does nothing
    if (modShift) {
      multi.rangeFromAnchor(orderedIds, task.id, listId);
    } else if (modMeta) {
      multi.toggle(task.id, listId);
    } else {
      if (multi.active) multi.clear();
      startEdit();
    }
  }

  function onCancel(e: PointerEvent) {
    active = false;
    hadDown = false;
    lpFired = false;
    clearLp();
    disarmScrollBlocker();
    mainEl?.releasePointerCapture?.(e.pointerId);
  }

  // ---- Action menu ---------------------------------------------------------
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuEl: HTMLDivElement | undefined = $state();
  let bulkCtx = $state(false);
  let taskRect = $state<{ left: number; top: number; width: number; height: number } | null>(null);

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

  $effect(() => {
    if (!menuOpen || !menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const nx = Math.max(pad, Math.min(menuX, window.innerWidth - r.width - pad));
    const ny = Math.max(pad, Math.min(menuY, window.innerHeight - r.height - pad));
    if (nx !== menuX) menuX = nx;
    if (ny !== menuY) menuY = ny;
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    bulkCtx = multi.has(task.id) && multi.size > 1;
    openMenu(e.clientX, e.clientY);
  }

  function runMenu(action: () => void) {
    menuOpen = false;
    action();
  }

  // ---- Delete confirmation -------------------------------------------------
  let confirmDelete = $state(false);
  let confirmBulk = $state(false);

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

  function bulkComplete(target: boolean) {
    onBulkComplete(multi.list, target);
  }

  function handleToggle() {
    const willComplete = !task.completed;
    onToggle(task);
    setTimeout(() => {
      if (willComplete) notifySuccess();
      else tapLight();
    }, 0);
  }
</script>

<li
  bind:this={el}
  data-dnd-item={task.id}
  class="group relative rounded-2xl
    {isSelected ? 'outline outline-2 outline-[var(--color-accent)]' : ''}
    {isDragging ? 'opacity-30' : 'animate-fade-up'}
    {menuOpen ? 'invisible' : ''}"
  style="animation-delay: {index * 50}ms"
  oncontextmenu={handleContextMenu}
>
  <div
    bind:this={mainEl}
    class="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl no-touch-select
      {task.completed ? 'bg-[var(--color-done)]' : 'bg-[var(--color-surface)]'}"
    style="touch-action: pan-y;"
    role="textbox"
    tabindex="0"
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onCancel}
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
      <div class="flex-1 min-w-0">
        <TaskContent {task} dimmed={task.completed} />
      </div>
    {/if}
  </div>

  <!-- Checkbox: extrudes slightly outside the top-left corner. -->
  <button
    data-task-checkbox
    type="button"
    onclick={handleToggle}
    tabindex={-1}
    aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
    class="absolute -top-1.5 -left-1.5 z-10 w-5 h-5 rounded-md flex items-center justify-center
      border-2 transition-colors
      {task.completed
        ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
        : 'bg-[var(--color-bg)] border-[var(--color-ink-3)] hover:border-[var(--color-ink)]'}"
  >
    {#if task.completed}
      <Check size={12} strokeWidth={3} class="text-[var(--color-bg)]" />
    {/if}
  </button>
</li>

{#if menuOpen}
  <div use:portal>
    <button
      aria-label="Close menu"
      class="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm animate-fade-in"
      onpointerdown={(e) => e.stopPropagation()}
      onpointerup={(e) => e.stopPropagation()}
      onclick={() => (menuOpen = false)}
    ></button>
    {#if taskRect}
      <div
        class="fixed z-[45] pointer-events-none rounded-2xl
          {isSelected ? 'outline outline-2 outline-[var(--color-accent)]' : ''}"
        style="left: {taskRect.left}px; top: {taskRect.top}px; width: {taskRect.width}px; height: {taskRect.height}px;"
      >
        <div
          class="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl h-full
            {task.completed ? 'bg-[var(--color-done)]' : 'bg-[var(--color-surface)]'}"
        >
          <div class="flex-1 min-w-0">
            <TaskContent {task} dimmed={task.completed} />
          </div>
        </div>
      </div>
    {/if}
    <div
      bind:this={menuEl}
      class="fixed z-[55] w-48 py-1.5 rounded-2xl bg-[var(--color-surface-2)] no-touch-select
        border border-[var(--color-border)] shadow-xl shadow-black/40 animate-fade-in"
      style="left: {menuX}px; top: {menuY}px;"
    >
      {#if bulkCtx}
        <button
          onclick={() => runMenu(() => bulkComplete(true))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Check size={14} class="text-[var(--color-accent)]" />
          Mark {multi.size} complete
        </button>
        <button
          onclick={() => runMenu(() => bulkComplete(false))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Undo2 size={14} class="text-[var(--color-ink-3)]" />
          Mark {multi.size} incomplete
        </button>
        <button
          onclick={() => runMenu(askDelete)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
            hover:bg-[var(--color-danger-glow)] transition-colors"
        >
          <Trash2 size={14} />
          Delete {multi.size}
        </button>
      {:else}
        <button
          onclick={() => runMenu(startEdit)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Pencil size={14} class="text-[var(--color-ink-3)]" />
          Edit
        </button>
        <button
          onclick={() => runMenu(() => onDuplicate(task))}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
            hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <Copy size={14} class="text-[var(--color-ink-3)]" />
          Duplicate
        </button>
        <button
          onclick={() => runMenu(askDelete)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
            hover:bg-[var(--color-danger-glow)] transition-colors"
        >
          <Trash2 size={14} />
          Delete
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if confirmDelete}
  <div use:portal>
    <button
      aria-label="Cancel"
      class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
      onclick={() => (confirmDelete = false)}
    ></button>
    <div
      class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(90vw,320px)]
        p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
        shadow-2xl shadow-black/50 animate-scale-in"
    >
      <p class="text-sm font-semibold mb-1">
        {confirmBulk ? `Delete ${multi.size} tasks?` : "Delete task?"}
      </p>
      <p class="text-[13px] font-light text-[var(--color-ink-2)] mb-4 line-clamp-2">
        {confirmBulk ? "This cannot be undone." : stripTokens(task.text)}
      </p>
      <div class="flex items-center gap-2">
        <button
          onclick={doDelete}
          class="flex-1 py-2.5 rounded-2xl bg-[var(--color-danger)] text-white text-[13px] font-medium
            active:scale-[0.98] transition-transform"
        >
          Delete
        </button>
        <button
          onclick={() => (confirmDelete = false)}
          class="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] text-[13px] font-medium
            text-[var(--color-ink-2)]"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
