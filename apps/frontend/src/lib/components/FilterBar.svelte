<script lang="ts">
  import { Eye, EyeOff, Settings2, X } from "lucide-svelte";
  import { untrack } from "svelte";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { portal } from "$lib/portal";
  import { projects } from "$lib/projects.svelte";
  import { chipDrag } from "./filter-bar/chip-drag.svelte";
  import { makeChipPressHandler } from "./filter-bar/chip-press";
  import ChipMenu from "./filter-bar/ChipMenu.svelte";
  import EditorModal from "./filter-bar/EditorModal.svelte";
  import ProjectAvatar from "./ProjectAvatar.svelte";

  let editing = $state<Project | null>(null);
  let barEl: HTMLDivElement | undefined = $state();
  let menu = $state<{ project: Project; x: number; y: number } | null>(null);

  $effect(() => chipDrag.bindBar(barEl ?? null));

  // Scroll bar + active chip into view on in-task-pill taps only.
  $effect(() => {
    const tick = projects.scrollRequestTick;
    if (tick === 0) return;
    untrack(() => {
      const id = projects.filterId;
      if (!id || !barEl) return;
      barEl.scrollIntoView({ behavior: "smooth", block: "start" });
      const chip = barEl.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(id)}"]`);
      chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  });

  const onChipPointerDown = makeChipPressHandler((project, x, y) => (menu = { project, x, y }));
  const onChipContextMenu = (e: MouseEvent, project: Project) => {
    e.preventDefault();
    menu = { project, x: e.clientX, y: e.clientY };
  };
</script>

{#if projects.list.length > 0}
  {@const shown = projects.showHidden ? projects.list : projects.visible}
  {@const hiddenCount = projects.hiddenList.length}
  {@const visibleNoDrag = shown.filter((p) => p.id !== chipDrag.draggingId)}
  <div
    bind:this={barEl}
    class="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"
    style="touch-action: pan-x; overscroll-behavior-x: contain;"
  >
    {#each visibleNoDrag as p, i (p.id)}
      {@const activeFilter = projects.filterId === p.id}
      {#if chipDrag.draggingId && chipDrag.dropIndex === i}
        <div
          class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)]/30"
          style="width: {chipDrag.ghostWidth}px; height: 28px;"
        ></div>
      {/if}
      <div
        data-chip-id={p.id}
        role="button"
        tabindex="0"
        oncontextmenu={(e) => onChipContextMenu(e, p)}
        onpointerdown={(e) => onChipPointerDown(e, p)}
        class="flex items-center rounded-full border transition-colors shrink-0 select-none
          {p.hidden ? 'opacity-50' : ''}
          {activeFilter
          ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/40'
          : 'bg-[var(--color-surface)] border-[var(--color-border)]'}"
      >
        <div
          class="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[12px] font-medium
            {activeFilter ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-2)]'}"
        >
          <ProjectAvatar project={p} size={18} />
          {applyCap(p.name, toCapMode(p.capitalization), true)}
        </div>
        {#if activeFilter}
          <button
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => (editing = p)}
            aria-label="Customize project"
            class="pr-2 text-[var(--color-accent)]/70 hover:text-[var(--color-accent)]"
          >
            <Settings2 size={13} />
          </button>
        {/if}
      </div>
    {/each}
    {#if chipDrag.draggingId && chipDrag.dropIndex === visibleNoDrag.length}
      <div
        class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)]/30"
        style="width: {chipDrag.ghostWidth}px; height: 28px;"
      ></div>
    {/if}

    {#if projects.filterId}
      <button
        onclick={() => projects.clearFilter()}
        class="flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full text-[12px] font-medium shrink-0
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
      >
        <X size={13} />
        Clear
      </button>
    {/if}

    {#if hiddenCount > 0}
      <button
        onclick={() => (projects.showHidden = !projects.showHidden)}
        class="flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full text-[12px] font-medium shrink-0
          text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
        aria-label={projects.showHidden ? "Hide hidden projects" : "Show hidden projects"}
      >
        {#if projects.showHidden}
          <EyeOff size={13} />
          Hide hidden
        {:else}
          <Eye size={13} />
          Show hidden ({hiddenCount})
        {/if}
      </button>
    {/if}
  </div>
{/if}

{#if chipDrag.draggingId}
  {@const dp = projects.byId(chipDrag.draggingId)}
  {#if dp}
    <div use:portal>
      <div
        class="fixed z-[80] pointer-events-none rounded-full border border-[var(--color-accent)]/40
          bg-[var(--color-accent-dim)] shadow-xl shadow-black/40"
        style="left: {chipDrag.ghostX}px; top: {chipDrag.ghostY}px; transform: translate(-50%, -50%);"
      >
        <div class="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[12px] font-medium text-[var(--color-accent)]">
          <ProjectAvatar project={dp} size={18} />
          {applyCap(dp.name, toCapMode(dp.capitalization), true)}
        </div>
      </div>
    </div>
  {/if}
{/if}

{#if menu}
  <ChipMenu
    project={menu.project}
    x={menu.x}
    y={menu.y}
    onClose={() => (menu = null)}
    onToggleHidden={async () => {
      const p = menu?.project;
      menu = null;
      if (p) await projects.update(p.id, { hidden: !p.hidden });
    }}
    onCustomize={() => {
      editing = menu?.project ?? null;
      menu = null;
    }}
  />
{/if}

{#if editing}
  <EditorModal project={editing} onClose={() => (editing = null)} />
{/if}

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    scrollbar-width: none;
  }
</style>
