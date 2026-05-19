<script lang="ts">
  // Desktop-only marquee selection. Pressing a mouse button on empty space
  // (not a task row, button, link, or input) starts a drag-rectangle; tasks
  // whose row intersects the rectangle are added to the global selection.
  // Holding Cmd/Ctrl/Shift adds to the existing selection; otherwise the
  // selection is replaced.

  import { dnd } from "$lib/dnd.svelte";
  import { selection as multi } from "$lib/selection.svelte";

  let dragging = $state(false);
  let startX = 0;
  let startY = 0;
  let curX = $state(0);
  let curY = $state(0);
  let baseIds: string[] = []; // selection state at the moment the drag began
  let baseListId: string | null = null;

  const rect = $derived({
    left: Math.min(startX, curX),
    top: Math.min(startY, curY),
    width: Math.abs(curX - startX),
    height: Math.abs(curY - startY),
  });

  // Anything inside these counts as "interactive" — do not start a marquee.
  const INTERACTIVE = "button, a, input, textarea, select, [contenteditable]," +
    " [data-dnd-item], [data-chip-id], [role='textbox']";

  function onDown(e: PointerEvent) {
    if (e.pointerType !== "mouse" || e.button !== 0 || dnd.active) return;
    const t = e.target as Element | null;
    if (!t || t.closest(INTERACTIVE)) return;
    // Empty page background → start marquee. preventDefault would otherwise
    // suppress the focus change, leaving an in-progress task edit unsaved;
    // commit it first by explicitly blurring the active element.
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body) a.blur();
    e.preventDefault();
    dragging = true;
    startX = curX = e.clientX;
    startY = curY = e.clientY;
    baseIds = e.shiftKey || e.metaKey || e.ctrlKey ? multi.list : [];
    baseListId = multi.anchorListId;
    if (baseIds.length === 0) multi.clear();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return;
    curX = e.clientX;
    curY = e.clientY;
    recomputeSelection();
  }

  function onUp() {
    dragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }

  function intersects(a: DOMRect) {
    return !(
      a.right < rect.left ||
      a.left > rect.left + rect.width ||
      a.bottom < rect.top ||
      a.top > rect.top + rect.height
    );
  }

  function recomputeSelection() {
    const hits = [...document.querySelectorAll<HTMLElement>("[data-dnd-item]")]
      .filter((n) => intersects(n.getBoundingClientRect()))
      .map((n) => n.dataset.dndItem!)
      .filter(Boolean);
    const next = new Set<string>(baseIds);
    for (const id of hits) next.add(id);
    multi.ids.clear();
    for (const id of next) multi.ids.add(id);
    // Anchor on the first hit so a subsequent shift-click pivots from there.
    if (hits.length) {
      multi.anchorId = hits[hits.length - 1];
      // Look up the anchor's list from the closest enclosing list element.
      const node = document.querySelector<HTMLElement>(
        `[data-dnd-item="${multi.anchorId}"]`,
      );
      multi.anchorListId = node?.closest<HTMLElement>("[data-dnd-list]")?.dataset.dndList ?? baseListId;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && multi.active) {
      multi.clear();
    }
  }

  $effect(() => {
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

{#if dragging && (rect.width > 2 || rect.height > 2)}
  <div
    class="fixed z-40 pointer-events-none rounded-md
      bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/60"
    style="left: {rect.left}px; top: {rect.top}px;
      width: {rect.width}px; height: {rect.height}px"
  ></div>
{/if}
