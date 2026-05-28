import type { Project } from "$lib/api";
import { selection, selectionEnd, selectionStart, tapMedium } from "$lib/haptics";
import { projects } from "$lib/projects.svelte";

// Reorder chips via pointer drag. Insertion index is expressed against the
// currently-visible projects slice with the dragged item removed.
class ChipDrag {
  draggingId = $state<string | null>(null);
  ghostX = $state(0);
  ghostY = $state(0);
  ghostWidth = $state(0);
  dropIndex = $state(0);
  #sourceIds: string[] = [];
  #barEl: HTMLElement | null = null;

  bindBar(el: HTMLElement | null) {
    this.#barEl = el;
  }

  start(p: Project, x: number, y: number, chip: HTMLElement) {
    this.draggingId = p.id;
    const r = chip.getBoundingClientRect();
    this.ghostWidth = r.width;
    this.ghostX = x;
    this.ghostY = y;
    const visibleIds = (projects.showHidden ? projects.list : projects.visible).map((q) => q.id);
    this.#sourceIds = visibleIds;
    this.dropIndex = visibleIds.indexOf(p.id);
    document.documentElement.classList.add("dnd-dragging");
    selectionStart();
    window.addEventListener("pointermove", this.#move, { passive: false });
    window.addEventListener("pointerup", this.#end);
    window.addEventListener("pointercancel", this.#end);
  }

  #move = (e: PointerEvent) => {
    e.preventDefault();
    this.ghostX = e.clientX;
    this.ghostY = e.clientY;
    if (!this.#barEl || !this.draggingId) return;
    const chips = [...this.#barEl.querySelectorAll<HTMLElement>("[data-chip-id]")].filter(
      (n) => n.dataset.chipId !== this.draggingId,
    );
    let idx = chips.length;
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        idx = i;
        break;
      }
    }
    if (idx !== this.dropIndex) {
      this.dropIndex = idx;
      selection();
    }
  };

  #end = async () => {
    const id = this.draggingId;
    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("pointermove", this.#move);
    window.removeEventListener("pointerup", this.#end);
    window.removeEventListener("pointercancel", this.#end);
    selectionEnd();
    this.draggingId = null;
    if (!id) return;

    const without = this.#sourceIds.filter((x) => x !== id);
    without.splice(this.dropIndex, 0, id);
    if (without.every((x, i) => x === this.#sourceIds[i])) return;

    let next: string[];
    if (projects.showHidden) {
      next = without;
    } else {
      // Splice the new visible order into the visible chips' positions
      // within the full list (preserving hidden projects' relative order).
      const visibleSet = new Set(this.#sourceIds);
      next = [];
      let v = 0;
      for (const fid of projects.list.map((p) => p.id)) {
        if (visibleSet.has(fid)) next.push(without[v++]);
        else next.push(fid);
      }
    }
    tapMedium();
    await projects.reorder(next);
  };
}

export const chipDrag = new ChipDrag();
