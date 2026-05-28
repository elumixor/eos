<script lang="ts">
  import { Check, Copy, Pencil, Trash2, Undo2 } from "lucide-svelte";
  import type { Task } from "$lib/api";
  import { portal } from "$lib/portal";
  import { selection as multi } from "$lib/selection.svelte";
  import TaskContent from "../TaskContent.svelte";

  let {
    task,
    x,
    y,
    bulk,
    rect,
    isSelected,
    onClose,
    onEdit,
    onDuplicate,
    onDelete,
    onBulkComplete,
  }: {
    task: Task;
    x: number;
    y: number;
    bulk: boolean;
    rect: { left: number; top: number; width: number; height: number } | null;
    isSelected: boolean;
    onClose: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onBulkComplete: (target: boolean) => void;
  } = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  /* svelte-ignore state_referenced_locally */
  let menuX = $state(x);
  /* svelte-ignore state_referenced_locally */
  let menuY = $state(y);

  $effect(() => {
    if (!menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    menuX = Math.max(pad, Math.min(menuX, window.innerWidth - r.width - pad));
    menuY = Math.max(pad, Math.min(menuY, window.innerHeight - r.height - pad));
  });

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
</script>

<div use:portal>
  <button
    aria-label="Close menu"
    class="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm animate-fade-in"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onclick={onClose}
  ></button>
  {#if rect}
    <div
      class="fixed z-[45] pointer-events-none rounded-2xl animate-drag-lift
        {isSelected ? 'outline outline-2 outline-[var(--color-accent)]' : ''}"
      style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px;"
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
    {#if bulk}
      <button
        onclick={run(() => onBulkComplete(true))}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <Check size={14} class="text-[var(--color-accent)]" />
        Mark {multi.size} complete
      </button>
      <button
        onclick={run(() => onBulkComplete(false))}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <Undo2 size={14} class="text-[var(--color-ink-3)]" />
        Mark {multi.size} incomplete
      </button>
      <button
        onclick={run(onDelete)}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
          hover:bg-[var(--color-danger-glow)] transition-colors"
      >
        <Trash2 size={14} />
        Delete {multi.size}
      </button>
    {:else}
      <button
        onclick={run(onEdit)}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <Pencil size={14} class="text-[var(--color-ink-3)]" />
        Edit
      </button>
      <button
        onclick={run(onDuplicate)}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <Copy size={14} class="text-[var(--color-ink-3)]" />
        Duplicate
      </button>
      <button
        onclick={run(onDelete)}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-danger)]
          hover:bg-[var(--color-danger-glow)] transition-colors"
      >
        <Trash2 size={14} />
        Delete
      </button>
    {/if}
  </div>
</div>
