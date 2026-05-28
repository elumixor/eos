<script lang="ts">
  import { Check } from "lucide-svelte";

  let {
    completed,
    hidden,
    onToggle,
  }: { completed: boolean; hidden: boolean; onToggle: () => void } = $props();
</script>

<button
  data-task-checkbox
  type="button"
  onclick={onToggle}
  tabindex={-1}
  aria-label={completed ? "Mark incomplete" : "Mark complete"}
  class="absolute -top-1.5 -left-1.5 z-10 w-5 h-5 rounded-md flex items-center justify-center
    border-2 transition-colors
    {hidden ? 'invisible' : ''}
    {completed
      ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
      : 'bg-[var(--color-bg)] border-[var(--color-ink-3)] hover:border-[var(--color-ink)]'}"
>
  {#if completed}
    <Check size={12} strokeWidth={3} class="text-[var(--color-bg)]" />
  {/if}
</button>
