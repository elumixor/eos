<script lang="ts">
  import { untrack } from "svelte";
  import { X, Settings2, Eye, EyeOff } from "lucide-svelte";
  import type { Project } from "$lib/api";
  import { applyCap, toCapMode } from "$lib/capitalize";
  import { projects } from "$lib/projects.svelte";
  import { selection, selectionEnd, selectionStart, tapMedium } from "$lib/haptics";
  import ProjectAvatar from "./ProjectAvatar.svelte";
  import ProjectAvatarEditor from "./ProjectAvatarEditor.svelte";

  let editing = $state<Project | null>(null);
  let barEl: HTMLDivElement | undefined = $state();

  // Scroll the bar + active chip into view on in-task-pill taps only.
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

  // Portal menus/overlays out of the bar (which uses overflow-x-auto and
  // would otherwise crop them).
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // ── Right-click / long-press context menu ───────────────────────────
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuProject = $state<Project | null>(null);
  let menuEl: HTMLDivElement | undefined = $state();

  function openMenu(p: Project, x: number, y: number) {
    menuProject = p;
    menuX = x;
    menuY = y;
    menuOpen = true;
  }

  $effect(() => {
    if (!menuOpen || !menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const nx = Math.max(pad, Math.min(menuX, window.innerWidth - r.width - pad));
    const ny = Math.max(pad, Math.min(menuY, window.innerHeight - r.height - pad));
    if (nx !== menuX) menuX = nx;
    if (ny !== menuY) menuY = ny;
  });

  function onChipContextMenu(e: MouseEvent, p: Project) {
    e.preventDefault();
    openMenu(p, e.clientX, e.clientY);
  }

  async function toggleHiddenFromMenu() {
    const p = menuProject;
    menuOpen = false;
    if (!p) return;
    await projects.update(p.id, { hidden: !p.hidden });
  }

  function customizeFromMenu() {
    const p = menuProject;
    menuOpen = false;
    if (!p) return;
    editing = p;
  }

  // ── Pointer dispatch: tap → filter, long-press → menu, move → drag ──
  //
  // The chip's pointerdown stays tentative until it commits to one of:
  //   - drag       (pointer moved > MOVE_THRESHOLD px before LONG_PRESS_MS)
  //   - menu       (held still for LONG_PRESS_MS)
  //   - filter     (released before either of the above fired)
  // Right-click skips this state machine and opens the menu immediately.
  const MOVE_THRESHOLD = 6;
  const LONG_PRESS_MS = 450;

  let pressId = $state<string | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressX = 0;
  let pressY = 0;
  let pressedProject: Project | null = null;
  let pressActivated = false; // true once we commit to drag or menu

  // ── Drag state ──────────────────────────────────────────────────────
  let draggingId = $state<string | null>(null);
  let ghostX = $state(0);
  let ghostY = $state(0);
  let ghostWidth = $state(0);
  // Insertion index expressed against the currently-rendered `shown` list,
  // with the dragged item removed. 0..shown.length-1.
  let dropIndex = $state(0);
  // Snapshot of the order we're actively manipulating so dropIndex maps
  // against a stable list (the visible projects don't change during drag).
  let dragSourceIds: string[] = [];

  function startDrag(p: Project, x: number, y: number, chip: HTMLElement) {
    draggingId = p.id;
    const r = chip.getBoundingClientRect();
    ghostWidth = r.width;
    ghostX = x;
    ghostY = y;
    const visibleIds = (projects.showHidden ? projects.list : projects.visible).map((q) => q.id);
    dragSourceIds = visibleIds;
    dropIndex = visibleIds.indexOf(p.id);
    document.documentElement.classList.add("dnd-dragging");
    selectionStart();
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e: PointerEvent) {
    e.preventDefault();
    ghostX = e.clientX;
    ghostY = e.clientY;
    if (!barEl || !draggingId) return;
    const chips = [...barEl.querySelectorAll<HTMLElement>("[data-chip-id]")].filter(
      (n) => n.dataset.chipId !== draggingId,
    );
    let idx = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        idx = i;
        break;
      }
    }
    if (idx !== dropIndex) {
      dropIndex = idx;
      selection();
    }
  }

  async function onDragEnd() {
    const id = draggingId;
    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    selectionEnd();
    draggingId = null;
    if (!id) return;

    // Build the new ordering over the visible slice, then merge it back
    // into the full list (preserving hidden items' relative position when
    // they're not part of the visible slice).
    const without = dragSourceIds.filter((x) => x !== id);
    without.splice(dropIndex, 0, id);
    const beforeIds = projects.list.map((p) => p.id);
    if (without.every((x, i) => x === dragSourceIds[i])) return; // no-op

    // If we're showing everything, `without` is the full order. Otherwise
    // splice the new visible order into the slots the visible chips
    // currently occupy in the full list.
    let next: string[];
    if (projects.showHidden) {
      next = without;
    } else {
      const visibleSet = new Set(dragSourceIds);
      next = [];
      let v = 0;
      for (const fid of beforeIds) {
        if (visibleSet.has(fid)) {
          next.push(without[v++]);
        } else {
          next.push(fid);
        }
      }
    }
    tapMedium();
    await projects.reorder(next);
  }

  function onChipPointerDown(e: PointerEvent, p: Project) {
    if (e.button !== undefined && e.button !== 0) return; // ignore non-primary
    pressId = p.id;
    pressedProject = p;
    pressX = e.clientX;
    pressY = e.clientY;
    pressActivated = false;
    const chip = e.currentTarget as HTMLElement;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (pressActivated || !pressedProject) return;
      pressActivated = true;
      openMenu(pressedProject, pressX, pressY);
    }, LONG_PRESS_MS);

    const onMove = (me: PointerEvent) => {
      if (pressActivated) return;
      const dx = me.clientX - pressX;
      const dy = me.clientY - pressY;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
      // Commit to drag; cancel pending menu.
      pressActivated = true;
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (pressedProject) startDrag(pressedProject, me.clientX, me.clientY, chip);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      // If we never activated drag or menu, this was a tap → toggle filter.
      if (!pressActivated && pressedProject) projects.toggleFilter(pressedProject.id);
      pressId = null;
      pressedProject = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
</script>

{#if projects.list.length > 0}
  {@const shown = projects.showHidden ? projects.list : projects.visible}
  {@const hiddenCount = projects.hiddenList.length}
  {@const visibleNoDrag = shown.filter((p) => p.id !== draggingId)}
  <div
    bind:this={barEl}
    class="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar -mx-1 px-1"
    style="touch-action: pan-x; overscroll-behavior-x: contain;"
  >
    {#each visibleNoDrag as p, i (p.id)}
      {@const activeFilter = projects.filterId === p.id}
      {@const showSlotBefore = draggingId && dropIndex === i}
      {#if showSlotBefore}
        <div
          class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50
            bg-[var(--color-accent-dim)]/30"
          style="width: {ghostWidth}px; height: 28px;"
        ></div>
      {/if}
      <div
        data-chip-id={p.id}
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
    {#if draggingId && dropIndex === visibleNoDrag.length}
      <div
        class="shrink-0 rounded-full border border-dashed border-[var(--color-accent)]/50
          bg-[var(--color-accent-dim)]/30"
        style="width: {ghostWidth}px; height: 28px;"
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

{#if draggingId}
  {@const dp = projects.byId(draggingId)}
  {#if dp}
    <div use:portal>
      <div
        class="fixed z-[80] pointer-events-none rounded-full border border-[var(--color-accent)]/40
          bg-[var(--color-accent-dim)] shadow-xl shadow-black/40"
        style="left: {ghostX}px; top: {ghostY}px; transform: translate(-50%, -50%);"
      >
        <div class="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 text-[12px] font-medium text-[var(--color-accent)]">
          <ProjectAvatar project={dp} size={18} />
          {applyCap(dp.name, toCapMode(dp.capitalization), true)}
        </div>
      </div>
    </div>
  {/if}
{/if}

{#if menuOpen && menuProject}
  <div use:portal>
    <button
      aria-label="Close menu"
      class="fixed inset-0 z-40 cursor-default"
      onpointerdown={() => (menuOpen = false)}
    ></button>
    <div
      bind:this={menuEl}
      class="fixed z-50 w-48 py-1.5 rounded-2xl bg-[var(--color-surface-2)]
        border border-[var(--color-border)] shadow-xl shadow-black/40 animate-fade-in"
      style="left: {menuX}px; top: {menuY}px;"
    >
      <button
        onclick={toggleHiddenFromMenu}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        {#if menuProject.hidden}
          <Eye size={14} class="text-[var(--color-ink-3)]" />
          Unhide
        {:else}
          <EyeOff size={14} class="text-[var(--color-ink-3)]" />
          Hide
        {/if}
      </button>
      <button
        onclick={customizeFromMenu}
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-light text-[var(--color-ink)]
          hover:bg-[var(--color-surface-3)] transition-colors"
      >
        <Settings2 size={14} class="text-[var(--color-ink-3)]" />
        Customize
      </button>
    </div>
  </div>
{/if}

{#if editing}
  <button
    aria-label="Close"
    class="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
    onclick={() => (editing = null)}
  ></button>
  <div
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[min(92vw,360px)]
      p-5 rounded-3xl bg-[var(--color-surface-2)] border border-[var(--color-border)]
      shadow-2xl shadow-black/50 animate-scale-in"
  >
    <ProjectAvatarEditor project={editing} onClose={() => (editing = null)} />
  </div>
{/if}

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    scrollbar-width: none;
  }
</style>
