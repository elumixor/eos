<script lang="ts">
  import type { Task } from "$lib/api";
  import { dnd } from "$lib/dnd.svelte";
  import TaskContent from "./TaskContent.svelte";

  let { task }: { task?: Task } = $props();
</script>

{#if dnd.active}
  <div
    class="fixed z-50 pointer-events-none px-4 py-3.5 rounded-2xl bg-[var(--color-surface-2)]
      shadow-xl shadow-black/40 text-[13px] font-light tracking-wide text-[var(--color-ink)]
      border border-[var(--color-accent)]/30 animate-drag-lift"
    style="left: {dnd.startLeft}px; top: {dnd.y - dnd.offsetY}px; width: {dnd.width}px;"
  >
    {#if dnd.taskIds.length > 1}
      <span class="font-medium text-[var(--color-accent)]">{dnd.label}</span>
    {:else if task}
      <TaskContent {task} />
    {:else}
      {dnd.label}
    {/if}
  </div>
{/if}
