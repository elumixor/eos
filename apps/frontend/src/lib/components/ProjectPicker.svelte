<script lang="ts">
  import { tick } from "svelte";
  import { Search } from "lucide-svelte";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let { onClose }: { onClose: () => void } = $props();

  let query = $state("");
  let active = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = projects.list;
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  });

  $effect(() => {
    // Clamp active index when the filtered list shrinks.
    void filtered.length;
    if (active >= filtered.length) active = 0;
  });

  $effect(() => {
    void active;
    if (!listEl) return;
    const el = listEl.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  });

  $effect(() => {
    void inputEl;
    tick().then(() => inputEl?.focus());
  });

  function choose(id: string) {
    // Apply the same filter as tapping the chip row: toggle off if it's
    // already the active filter, otherwise set it. Reveal hidden chips when
    // the selected project is hidden so the user can find it in the bar.
    if (projects.filterId !== id) {
      const target = projects.byId(id);
      if (target?.hidden) projects.showHidden = true;
    }
    projects.toggleFilter(id);
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length) active = (active + 1) % filtered.length;
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length) active = (active - 1 + filtered.length) % filtered.length;
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[active];
      if (p) choose(p.id);
    }
  }
</script>

<button
  aria-label="Close picker"
  class="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fade-in"
  onclick={onClose}
></button>
<div
  role="dialog"
  aria-label="Pick a project"
  class="fixed left-1/2 top-[18%] -translate-x-1/2 z-[71] w-[min(92vw,420px)]
    rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
    shadow-2xl shadow-black/50 animate-scale-in overflow-hidden"
>
  <div class="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
    <Search size={15} class="text-[var(--color-ink-3)] shrink-0" />
    <input
      bind:this={inputEl}
      bind:value={query}
      onkeydown={onKey}
      type="text"
      placeholder="Filter projects…"
      class="flex-1 bg-transparent text-[13px] font-light tracking-wide
        text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none"
    />
    <span class="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
      {filtered.length}
    </span>
  </div>

  <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto py-1.5">
    {#if filtered.length === 0}
      <div class="px-4 py-6 text-center text-[12px] font-light text-[var(--color-ink-3)]">
        No projects match
      </div>
    {:else}
      {#each filtered as p, i (p.id)}
        {@const isActive = i === active}
        {@const isFiltered = projects.filterId === p.id}
        {@const ups = projects.parentsOf(p.id)}
        <button
          type="button"
          data-idx={i}
          onpointerdown={(e) => {
            e.preventDefault();
            choose(p.id);
          }}
          onmouseenter={() => (active = i)}
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors
            {isActive ? 'bg-[var(--color-surface-3)]' : ''}
            {p.hidden ? 'opacity-60' : ''}"
        >
          <ProjectAvatar project={p} size={18} />
          <span class="text-[13px] font-medium text-[var(--color-ink)] truncate">
            {applyCap(p.name, toCapMode(p.capitalization), true)}
          </span>
          {#if ups.length}
            <span class="ml-auto flex items-center gap-1 flex-wrap justify-end">
              {#each ups as up (up.id)}
                <span
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                    bg-[var(--color-surface)] border border-[var(--color-border)]
                    text-[10px] font-medium text-[var(--color-ink-3)]"
                >
                  <ProjectAvatar project={up} size={12} />
                  {applyCap(up.name, toCapMode(up.capitalization), true)}
                </span>
              {/each}
            </span>
          {:else if isFiltered}
            <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
              Active
            </span>
          {:else}
            <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
              {p.hidden ? "Hidden" : ""}
            </span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
