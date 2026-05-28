<script lang="ts">
  import { portal } from "$lib/portal";
  import { selection as multi } from "$lib/selection.svelte";

  let {
    bulk,
    detail,
    onCancel,
    onConfirm,
  }: {
    bulk: boolean;
    /** Single-task preview text. Ignored in bulk mode. */
    detail: string;
    onCancel: () => void;
    onConfirm: () => void;
  } = $props();
</script>

<div use:portal>
  <button
    aria-label="Cancel"
    class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
    onclick={onCancel}
  ></button>
  <div
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(90vw,320px)]
      p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
      shadow-2xl shadow-black/50 animate-scale-in"
  >
    <p class="text-sm font-semibold mb-1">{bulk ? `Delete ${multi.size} tasks?` : "Delete task?"}</p>
    <p class="text-[13px] font-light text-[var(--color-ink-2)] mb-4 line-clamp-2">
      {bulk ? "This cannot be undone." : detail}
    </p>
    <div class="flex items-center gap-2">
      <button
        onclick={onConfirm}
        class="flex-1 py-2.5 rounded-2xl bg-[var(--color-danger)] text-white text-[13px] font-medium
          active:scale-[0.98] transition-transform"
      >
        Delete
      </button>
      <button
        onclick={onCancel}
        class="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] text-[13px] font-medium text-[var(--color-ink-2)]"
      >
        Cancel
      </button>
    </div>
  </div>
</div>
