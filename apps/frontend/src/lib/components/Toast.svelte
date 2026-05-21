<script lang="ts">
  import { X } from "lucide-svelte";
  import { toasts } from "$lib/toast.svelte";

  // Errors interrupt; info updates wait their turn. Two regions so screen
  // readers announce errors immediately without queueing behind a polite
  // status that may already be speaking.
  const errors = $derived(toasts.items.filter((t) => t.kind === "error"));
  const infos = $derived(toasts.items.filter((t) => t.kind !== "error"));
</script>

{#snippet stack(items: typeof toasts.items, region: "alert" | "status", live: "assertive" | "polite")}
  {#if items.length > 0}
    <div
      class="fixed inset-x-0 z-[70] pointer-events-none flex flex-col items-center gap-2 px-4"
      style="bottom: calc(6rem + env(safe-area-inset-bottom, 0px));"
      role={region}
      aria-live={live}
    >
      {#each items as t (t.id)}
        <div
          class="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-medium
            shadow-lg shadow-black/30 animate-fade-up max-w-[min(90vw,360px)]
            {t.kind === 'error'
            ? 'bg-[var(--color-danger)] text-white'
            : 'bg-[var(--color-surface-2)] text-[var(--color-ink)] border border-[var(--color-border)]'}"
        >
          <span class="flex-1 leading-snug">{t.message}</span>
          <button
            type="button"
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
{/snippet}

{@render stack(errors, "alert", "assertive")}
{@render stack(infos, "status", "polite")}
