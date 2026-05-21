<script lang="ts">
  import { X } from "lucide-svelte";
  import { toasts } from "$lib/toast.svelte";
</script>

{#if toasts.items.length > 0}
  <div
    class="fixed inset-x-0 z-[70] pointer-events-none flex flex-col items-center gap-2 px-4"
    style="bottom: calc(6rem + env(safe-area-inset-bottom, 0px));"
    role="status"
    aria-live="polite"
  >
    {#each toasts.items as t (t.id)}
      <div
        class="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium
          shadow-lg shadow-black/30 animate-fade-up max-w-[min(90vw,360px)]
          {t.kind === 'error'
          ? 'bg-[var(--color-danger)] text-white'
          : 'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-border)]'}"
      >
        <span class="flex-1 leading-snug">{t.message}</span>
        <button
          onclick={() => toasts.dismiss(t.id)}
          aria-label="Dismiss"
          class="shrink-0 -mr-1 p-1 rounded-lg opacity-70 hover:opacity-100 transition-opacity"
        >
          <X size={13} />
        </button>
      </div>
    {/each}
  </div>
{/if}
