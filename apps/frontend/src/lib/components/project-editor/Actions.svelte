<script lang="ts">
  import { Eye, EyeOff, Trash2 } from "lucide-svelte";

  let {
    busy,
    hidden,
    confirming = $bindable<boolean>(),
    label,
    onToggleHidden,
    onDelete,
  }: {
    busy: boolean;
    hidden: boolean;
    confirming: boolean;
    label: string;
    onToggleHidden: () => void;
    onDelete: () => void;
  } = $props();
</script>

{#if confirming}
  <div class="flex items-center gap-2">
    <button
      onclick={onDelete}
      disabled={busy}
      class="flex-1 py-2.5 rounded-2xl bg-[var(--color-danger)] text-white text-[13px] font-medium
        active:scale-[0.98] transition-transform disabled:opacity-50"
    >
      Delete “{label}”
    </button>
    <button
      onclick={() => (confirming = false)}
      class="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] text-[13px] font-medium text-[var(--color-ink-2)]"
    >
      Cancel
    </button>
  </div>
{:else}
  <div class="flex items-center gap-2">
    <button
      onclick={onToggleHidden}
      disabled={busy}
      class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
        text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-50"
    >
      {#if hidden}
        <Eye size={13} />
        Unhide
      {:else}
        <EyeOff size={13} />
        Hide
      {/if}
    </button>
    <button
      onclick={() => (confirming = true)}
      class="flex-1 flex items-center justify-center gap-2 py-2 text-[12px] font-medium
        text-[var(--color-ink-3)] hover:text-[var(--color-danger)] transition-colors"
    >
      <Trash2 size={13} />
      Delete
    </button>
  </div>
{/if}
