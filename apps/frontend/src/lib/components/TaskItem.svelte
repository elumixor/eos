<script lang="ts">
  import { Check, Trash2, Pencil, GripVertical, Copy } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { stripTokens } from "$lib/tokens";
  import { dnd } from "$lib/dnd.svelte";
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
    onToggle,
    onDelete,
    onEdit,
    onDuplicate,
  }: {
    task: Task;
    index: number;
    listId: string;
    onToggle: (task: Task) => void;
    onDelete: (task: Task) => void;
    onEdit: (task: Task, text: string) => void;
    onDuplicate: (task: Task) => void;
  } = $props();

  let el: HTMLLIElement | undefined = $state();
  const isDragging = $derived(dnd.taskId === task.id);

  function handleGripDown(e: PointerEvent) {
    e.preventDefault();
    tapLight();
    const width = el?.getBoundingClientRect().width ?? 0;
    dnd.start(task.id, task.text, listId, e, width);
  }

  let editing = $state(false);

  function startEdit() {
    editing = true;
  }

  function commitEdit(text: string) {
    const trimmed = text.trim();
    if (trimmed && trimmed !== task.text) onEdit(task, trimmed);
    editing = false;
  }

  // Tap text to edit; long-press (or right-click) opens the action menu.
  // Hover-only buttons are invisible on touch, so this is the iOS path.
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuEl: HTMLDivElement | undefined = $state();
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpFired = false;
  let downX = 0;
  let downY = 0;

  function openMenu(x: number, y: number) {
    menuX = x;
    menuY = y;
    menuOpen = true;
    tapMedium();
  }

  // Clamp into the viewport after the menu has rendered, so it can never
  // spill off the right/bottom edge regardless of where the press landed.
  $effect(() => {
    if (!menuOpen || !menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const nx = Math.max(pad, Math.min(menuX, window.innerWidth - r.width - pad));
    const ny = Math.max(pad, Math.min(menuY, window.innerHeight - r.height - pad));
    if (nx !== menuX) menuX = nx;
    if (ny !== menuY) menuY = ny;
  });

  function clearLp() {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }

  function handleTextPointerDown(e: PointerEvent) {
    if (editing) return;
    lpFired = false;
    downX = e.clientX;
    downY = e.clientY;
    clearLp();
    lpTimer = setTimeout(() => {
      lpFired = true;
      openMenu(downX, downY);
    }, 450);
  }

  function handleTextPointerMove(e: PointerEvent) {
    if (lpTimer && (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10))
      clearLp();
  }

  function handleTextClick() {
    clearLp();
    if (lpFired) {
      lpFired = false;
      return;
    }
    startEdit();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }

  function runMenu(action: () => void) {
    menuOpen = false;
    action();
  }

  let confirmDelete = $state(false);

  function askDelete() {
    menuOpen = false;
    confirmDelete = true;
  }

  function doDelete() {
    confirmDelete = false;
    notifyWarning();
    onDelete(task);
  }

  let justToggled = $state(false);
  function handleToggle() {
    justToggled = true;
    if (!task.completed) notifySuccess();
    else tapLight();
    onToggle(task);
    setTimeout(() => (justToggled = false), 350);
  }
</script>

<li
  bind:this={el}
  data-dnd-item={task.id}
  class="group flex items-center gap-2.5 px-4 py-3.5 rounded-2xl transition-all duration-300
    {task.completed
    ? 'bg-[var(--color-done)]'
    : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]'}
    {isDragging ? 'opacity-30' : 'animate-fade-up'}"
  style="animation-delay: {index * 50}ms"
  oncontextmenu={handleContextMenu}
>
  <!-- Drag handle -->
  <button
    onpointerdown={handleGripDown}
    aria-label="Reorder task"
    class="-ml-1 p-0.5 rounded-md text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]
      touch-none cursor-grab active:cursor-grabbing shrink-0
      opacity-40 group-hover:opacity-100 transition-opacity"
  >
    <GripVertical size={14} />
  </button>

  <!-- Checkbox -->
  <button
    onclick={handleToggle}
    class="w-[22px] h-[22px] rounded-lg border-[1.5px] flex items-center justify-center shrink-0
      transition-all duration-300
      {task.completed
      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
      : 'border-[var(--color-ink-3)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]'}
      {justToggled ? 'animate-check-pop' : ''}"
  >
    {#if task.completed}
      <Check size={12} strokeWidth={3} class="text-[var(--color-bg)]" />
    {/if}
  </button>

  <!-- Text / Edit -->
  {#if editing}
    <RichTaskInput
      value={task.text}
      autofocus
      submitOnBlur
      placeholder="Edit task"
      onsubmit={commitEdit}
    />
  {:else}
    <span
      class="flex-1 min-w-0 no-touch-select"
      onpointerdown={handleTextPointerDown}
      onpointermove={handleTextPointerMove}
      onpointerup={clearLp}
      onpointercancel={clearLp}
      onclick={handleTextClick}
      role="textbox"
      tabindex="0"
    >
      <TaskContent {task} dimmed={task.completed} />
    </span>
  {/if}

  <!-- Desktop-only quick delete. On touch, delete lives in the long-press
       menu; editing is tap-on-text everywhere, so no inline edit button. -->
  <div class="hidden pointer-fine:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
    <button
      onclick={askDelete}
      class="p-1.5 rounded-lg hover:bg-[var(--color-danger-glow)] transition-colors"
    >
      <Trash2 size={13} class="text-[var(--color-ink-3)] hover:text-[var(--color-danger)]" />
    </button>
  </div>
</li>

{#if menuOpen}
  <div use:portal>
  <!-- Backdrop closes the menu on any outside interaction -->
  <button
    aria-label="Close menu"
    class="fixed inset-0 z-40 cursor-default"
    onpointerdown={() => (menuOpen = false)}
  ></button>
  <div
    bind:this={menuEl}
    class="fixed z-50 w-44 py-1.5 rounded-2xl bg-[var(--color-surface-2)] no-touch-select
      border border-[var(--color-border)] shadow-xl shadow-black/40 animate-fade-in"
    style="left: {menuX}px; top: {menuY}px;"
  >
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
      <p class="text-sm font-semibold mb-1">Delete task?</p>
      <p class="text-[13px] font-light text-[var(--color-ink-2)] mb-4 line-clamp-2">
        {stripTokens(task.text)}
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
