<script lang="ts">
  import { Link2, MapPin, Plus } from "lucide-svelte";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { fmtLinkLabel } from "$lib/tokens";
  import ProjectAvatar from "../ProjectAvatar.svelte";
  import type { Item } from "./types";

  let {
    items,
    active = $bindable<number>(),
    style,
    onPick,
  }: {
    items: Item[];
    active: number;
    style: string;
    onPick: (item: Item) => void;
  } = $props();
</script>

<div
  use:portal
  class="fixed z-[200] max-h-64 overflow-y-auto py-1.5
    rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
    shadow-xl shadow-black/40 animate-fade-in"
  {style}
>
  {#each items as item, i (i)}
    <button
      type="button"
      onpointerdown={(e) => {
        e.preventDefault();
        onPick(item);
      }}
      onmouseenter={() => (active = i)}
      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors
        {i === active ? 'bg-[var(--color-surface-3)]' : ''}"
    >
      {#if item.kind === "project"}
        {@const ups = projects.parentsOf(item.project.id)}
        <span class="pill pill-project">
          <ProjectAvatar project={item.project} size={14} />
          {applyCap(item.project.name, toCapMode(item.project.capitalization), true)}
        </span>
        {#if ups.length}
          <span class="ml-auto flex items-center gap-1 flex-wrap justify-end">
            {#each ups as up (up.id)}
              <span class="pill pill-project pill-muted">
                <ProjectAvatar project={up} size={12} />
                {applyCap(up.name, toCapMode(up.capitalization), true)}
              </span>
            {/each}
          </span>
        {:else}
          <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Project</span>
        {/if}
      {:else if item.kind === "link"}
        <span
          class="w-[18px] h-[18px] rounded-full bg-[oklch(72%_0.14_235_/_0.16)]
            text-[oklch(78%_0.11_235)] flex items-center justify-center shrink-0"
        >
          <Link2 size={11} strokeWidth={2.5} />
        </span>
        <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">{fmtLinkLabel(item.url)}</span>
        <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] truncate max-w-[40%]">
          Link
        </span>
      {:else if item.kind === "place"}
        <span
          class="w-[18px] h-[18px] rounded-full bg-[oklch(74%_0.14_155_/_0.16)]
            text-[oklch(78%_0.12_155)] flex items-center justify-center shrink-0"
        >
          <MapPin size={11} strokeWidth={2.5} />
        </span>
        <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">{item.place.name}</span>
        <span class="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] truncate max-w-[40%]">
          {item.place.address || "Place"}
        </span>
      {:else if item.kind === "create"}
        <span
          class="w-[18px] h-[18px] rounded-full bg-[var(--color-accent-dim)] text-[var(--color-accent)]
            flex items-center justify-center shrink-0"
        >
          <Plus size={12} strokeWidth={3} />
        </span>
        <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">Create “{item.name}”</span>
        <span class="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Project</span>
      {:else}
        <span
          class="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 text-[11px]
            {item.sug.type === 'dur'
            ? 'bg-[oklch(74%_0.14_280_/_0.16)] text-[oklch(78%_0.1_280)]'
            : 'bg-[oklch(72%_0.16_35_/_0.14)] text-[var(--color-voice)]'}"
        >
          {item.sug.type === "dur" ? "⏳" : "🕑"}
        </span>
        <span class="text-[13px] font-medium text-[var(--color-ink)] flex-1 truncate">{item.sug.label}</span>
        <span class="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{item.sug.detail}</span>
      {/if}
    </button>
  {/each}
</div>
