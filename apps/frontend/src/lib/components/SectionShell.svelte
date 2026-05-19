<script lang="ts">
  import { ChevronDown, ChevronUp } from "lucide-svelte";
  import type { Snippet } from "svelte";

  let {
    title,
    completedCount = 0,
    totalCount = 0,
    collapsed = $bindable(false),
    collapsible = true,
    onToggleCollapsed,
    header,
    actions,
    children,
  }: {
    title?: string;
    completedCount?: number;
    totalCount?: number;
    collapsed?: boolean;
    collapsible?: boolean;
    onToggleCollapsed?: (collapsed: boolean) => void;
    header?: Snippet;
    actions?: Snippet;
    children: Snippet;
  } = $props();

  const allDone = $derived(totalCount > 0 && completedCount === totalCount);
  const progress = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

  function toggle() {
    if (!collapsible) return;
    collapsed = !collapsed;
    onToggleCollapsed?.(collapsed);
  }
</script>

<section class="animate-fade-up">
  <div class="w-full flex items-center gap-3 mb-3 group/header">
    <button
      type="button"
      class="flex-1 flex items-center gap-3 min-w-0 cursor-pointer text-left"
      onclick={toggle}
    >
      {#if header}
        {@render header()}
      {:else}
        <h2 class="text-base font-semibold tracking-tight truncate">{title}</h2>
      {/if}

      {#if totalCount > 0}
        <span class="font-mono text-[11px] tracking-wider text-[var(--color-ink-3)]
          {allDone ? 'text-[var(--color-accent)]' : ''}">
          {completedCount}/{totalCount}
        </span>
      {/if}
    </button>

    {#if actions}
      {@render actions()}
    {/if}

    {#if collapsible}
      <button
        type="button"
        onclick={toggle}
        aria-label={collapsed ? "Expand" : "Collapse"}
        class="text-[var(--color-ink-3)] opacity-0 group-hover/header:opacity-100 transition-opacity"
      >
        {#if collapsed}
          <ChevronDown size={16} />
        {:else}
          <ChevronUp size={16} />
        {/if}
      </button>
    {/if}
  </div>

  {#if totalCount > 0 && !collapsed}
    <div class="progress-track mb-4">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
  {/if}

  {#if !collapsed}
    {@render children()}
  {/if}
</section>
