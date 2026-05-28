<script lang="ts">
  import { Archive, Settings as SettingsIcon } from "lucide-svelte";
  import FilterBar from "./FilterBar.svelte";

  interface Props {
    archivedCount: number;
    popClass?: string;
  }

  const { archivedCount, popClass = "" }: Props = $props();
</script>

<div class="fixed top-0 inset-x-0 z-40 pointer-events-none">
  <div
    class="bg-[linear-gradient(to_bottom,var(--color-bg)_0%,var(--color-bg)_75%,transparent_100%)]"
    style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.25rem); padding-bottom: 1.5rem;"
  >
    <header class="max-w-md mx-auto px-5 pt-2 flex items-center gap-3 pointer-events-auto">
      <a
        href="/archive"
        aria-label="Archive ({archivedCount})"
        class="shrink-0 relative leading-none text-ink-3 hover:text-ink transition-colors {popClass}"
      >
        <Archive size={18} strokeWidth={1.75} />
        {#if archivedCount > 0}
          <span
            class="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 px-1 rounded-full
              bg-accent text-bg text-[9px] font-semibold leading-3.5 text-center"
          >{archivedCount > 99 ? "99+" : archivedCount}</span>
        {/if}
      </a>
      <div class="flex-1 min-w-0">
        <FilterBar />
      </div>
      <a
        href="/settings"
        aria-label="Settings"
        class="shrink-0 leading-none text-ink-3 hover:text-ink transition-colors"
      >
        <SettingsIcon size={18} strokeWidth={1.75} />
      </a>
    </header>
  </div>
</div>
