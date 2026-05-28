<script lang="ts">
  import { applyCap, type CapMode } from "$lib/capitalize";

  let {
    mode,
    name,
    onSelect,
  }: {
    mode: CapMode;
    name: string;
    onSelect: (m: CapMode) => void;
  } = $props();

  const preview = (m: CapMode) => applyCap(name || "Aa", m, true);
</script>

<div class="px-1">
  <div class="text-[11px] uppercase tracking-wider text-[var(--color-ink-3)] mb-2">Capitalization</div>
  <div class="flex gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)]">
    {#each [["sentence", "Sentence"], ["lower", "lower"], ["capitalized", "Capitalized"], ["upper", "UPPER"]] as [id, label] (id)}
      <button
        type="button"
        onclick={() => onSelect(id as CapMode)}
        class="flex-1 py-1.5 rounded-xl text-[12px] font-medium transition-colors
          {mode === id ? 'bg-[var(--color-surface-3)] text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'}"
        title={preview(id as CapMode)}
      >
        {label}
      </button>
    {/each}
  </div>
</div>
