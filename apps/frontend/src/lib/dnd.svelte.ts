// Pointer-based drag & drop shared state. Works for both touch (iOS) and mouse.
// Lists register via `data-dnd-list="<id>"`, items via `data-dnd-item="<taskId>"`.

import { selection, selectionEnd, selectionStart, tapMedium } from "$lib/haptics";

interface DropPayload {
  taskId: string;
  from: string;
  to: string;
  index: number;
}

class Dnd {
  taskId = $state<string | null>(null);
  label = $state("");
  fromList = $state<string | null>(null);
  overList = $state<string | null>(null);
  overIndex = $state(0);
  x = $state(0);
  y = $state(0);
  width = $state(0);

  onDrop: ((p: DropPayload) => void) | null = null;

  get active() {
    return this.taskId !== null;
  }

  private rafId = 0;
  private pendingX = 0;
  private pendingY = 0;

  start(taskId: string, label: string, from: string, ev: PointerEvent, width: number) {
    this.taskId = taskId;
    this.label = label;
    this.fromList = from;
    this.overList = from;
    this.overIndex = 0;
    this.x = ev.clientX;
    this.y = ev.clientY;
    this.pendingX = ev.clientX;
    this.pendingY = ev.clientY;
    this.width = width;
    // Suppress native text selection / iOS touch-callout for the whole drag.
    document.documentElement.classList.add("dnd-dragging");
    window.addEventListener("pointermove", this.move, { passive: false });
    window.addEventListener("pointerup", this.end);
    window.addEventListener("pointercancel", this.end);
  }

  // pointermove fires far faster than paint on touch devices; capture the
  // latest coords and reconcile once per frame so we never thrash reactivity.
  private move = (ev: PointerEvent) => {
    ev.preventDefault();
    this.pendingX = ev.clientX;
    this.pendingY = ev.clientY;
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(this.flush);
  };

  private flush = () => {
    this.rafId = 0;
    if (this.taskId === null) return;

    this.x = this.pendingX;
    this.y = this.pendingY;

    const el = document.elementFromPoint(this.pendingX, this.pendingY);
    const listEl = el?.closest<HTMLElement>("[data-dnd-list]");
    if (!listEl) return;

    const prevList = this.overList;
    const prevIndex = this.overIndex;
    this.overList = listEl.dataset.dndList ?? null;

    // Items excluding the one being dragged, so the index maps directly onto
    // the post-removal array.
    const items = [...listEl.querySelectorAll<HTMLElement>("[data-dnd-item]")].filter(
      (n) => n.dataset.dndItem !== this.taskId,
    );

    let idx = items.length;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (this.pendingY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    this.overIndex = idx;

    // Tick whenever the drop slot moves so the drag feels physical.
    if (this.overList !== prevList || this.overIndex !== prevIndex) selection();
  };

  private end = () => {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.end);
    window.removeEventListener("pointercancel", this.end);

    if (this.taskId && this.fromList && this.overList && this.onDrop) {
      tapMedium();
      this.onDrop({
        taskId: this.taskId,
        from: this.fromList,
        to: this.overList,
        index: this.overIndex,
      });
    }

    this.taskId = null;
    this.fromList = null;
    this.overList = null;
  };
}

export const dnd = new Dnd();
