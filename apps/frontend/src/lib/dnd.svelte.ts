// Pointer-based drag & drop shared state. Works for both touch (iOS) and mouse.
// Lists register via `data-dnd-list="<id>"`, items via `data-dnd-item="<taskId>"`.
//
// A drag carries one or more task IDs; multi-drag is used when the user starts
// dragging a task that's part of a multi-selection — the whole selection
// travels together and is dropped as a contiguous group at the drop slot.

import { selection, selectionEnd, selectionStart, tapMedium } from "$lib/haptics";
import { AutoScroller, inEdgeZone } from "./dnd/auto-scroll";
import { suppressNextClick } from "./dnd/click-suppress";
import { findDropSlot } from "./dnd/hit-test";

interface DropPayload {
  taskIds: string[];
  from: string;
  to: string;
  index: number;
}

class Dnd {
  taskIds = $state<string[]>([]);
  label = $state("");
  fromList = $state<string | null>(null);
  overList = $state<string | null>(null);
  overIndex = $state(0);
  x = $state(0);
  y = $state(0);
  // Horizontal position is locked at gesture start — drag is vertical-only.
  startLeft = $state(0);
  width = $state(0);
  height = $state(44);
  // Offset of the pointer from the dragged element's top-left at gesture
  // start. The ghost is positioned at (x - offsetX, y - offsetY) so the
  // finger stays at exactly the point on the row it grabbed.
  offsetX = $state(0);
  offsetY = $state(0);

  onDrop: ((p: DropPayload) => void) | null = null;

  /** Primary task being dragged. Used for the ghost preview. */
  get taskId() {
    return this.taskIds[0] ?? null;
  }
  get active() {
    return this.taskIds.length > 0;
  }
  has(id: string) {
    return this.taskIds.includes(id);
  }

  #rafId = 0;
  #pendingX = 0;
  #pendingY = 0;
  // Cleared when the finger is not over any registered list; gates whether
  // pointerup commits the drop. Otherwise releasing the finger over a
  // header / FAB / status bar would silently drop into the most recently
  // hovered list at a stale index.
  #validSlot = false;
  #autoScroll = new AutoScroller({
    getY: () => this.#pendingY,
    isActive: () => this.active,
    onTick: () => this.#recomputeDropSlot(),
  });

  /**
   * Returns false if a drag is already in progress so the caller can roll
   * back any local lock state. A silent no-op would leave the second
   * initiator's UI stuck with no Dnd tracking it.
   */
  start(
    taskIds: string | string[],
    label: string,
    from: string,
    ev: { clientX: number; clientY: number },
    width: number,
    rect?: { left: number; top: number; height: number },
  ): boolean {
    // Re-entrancy guard: a stray second long-press or future call path that
    // skips finish() must not stomp on in-flight drag state.
    if (this.active) return false;
    this.taskIds = Array.isArray(taskIds) ? taskIds.slice() : [taskIds];
    this.label = label;
    this.fromList = from;
    this.overList = from;
    this.overIndex = 0;
    this.#validSlot = true;
    this.x = this.#pendingX = ev.clientX;
    this.y = this.#pendingY = ev.clientY;
    this.width = width;
    // If the caller knows the dragged element's box, preserve the grab point
    // exactly. Otherwise center the ghost — any fixed offset re-introduces
    // the "ghost snaps to a constant position" symptom.
    if (rect) {
      this.offsetX = ev.clientX - rect.left;
      this.offsetY = ev.clientY - rect.top;
      this.startLeft = rect.left;
      this.height = rect.height;
    } else {
      this.offsetX = width / 2;
      this.offsetY = 0;
      this.startLeft = ev.clientX - width / 2;
      this.height = 44;
    }
    // Suppress native text-selection / iOS touch-callout for the whole drag.
    // The class also sets `touch-action: none`, which prevents browser panning
    // while we handle pointermove ourselves.
    document.documentElement.classList.add("dnd-dragging");
    // iOS Safari keeps the page panning unless a non-passive touchmove
    // listener swallows it. Locking body overflow also works but breaks
    // window.scrollBy on desktop.
    window.addEventListener("touchmove", this.#blockTouch, { passive: false });
    selectionStart();
    window.addEventListener("pointermove", this.#move, { passive: false });
    window.addEventListener("pointerup", this.#endDrop);
    window.addEventListener("pointercancel", this.#cancelDrop);
    // Recompute immediately so a drag that starts already over a valid index
    // isn't misreported as "before slot 0" until the next move.
    this.#recomputeDropSlot();
    return true;
  }

  // pointermove fires far faster than paint on touch devices; capture the
  // latest coords and reconcile once per frame so we never thrash reactivity.
  #blockTouch = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault();
  };

  #move = (ev: PointerEvent) => {
    if (ev.cancelable) ev.preventDefault();
    this.#pendingX = ev.clientX;
    this.#pendingY = ev.clientY;
    if (!this.#rafId) this.#rafId = requestAnimationFrame(this.#flush);
    if (inEdgeZone(ev.clientY)) this.#autoScroll.arm();
  };

  #flush = () => {
    this.#rafId = 0;
    if (this.taskIds.length === 0) return;
    this.x = this.#pendingX;
    this.y = this.#pendingY;
    this.#recomputeDropSlot();
  };

  #recomputeDropSlot() {
    const prevList = this.overList;
    const prevIndex = this.overIndex;
    const slot = findDropSlot(this.#pendingX, this.#pendingY, this.taskIds);
    this.#validSlot = slot.valid;
    if (!slot.valid) return;
    this.overList = slot.listId;
    this.overIndex = slot.index;
    // Tick whenever the drop slot moves so the drag feels physical.
    if (this.overList !== prevList || this.overIndex !== prevIndex) selection();
  }

  // `pointerup` → commit the drop. The pointer event carries the final coords,
  // which we trust over the last rAF state.
  #endDrop = (ev: PointerEvent) => {
    this.#pendingX = ev.clientX;
    this.#pendingY = ev.clientY;
    this.#recomputeDropSlot();
    this.#finish(true);
  };

  // `pointercancel` → the OS took the gesture away. Discard the drop rather
  // than commit it.
  #cancelDrop = () => this.#finish(false);

  #finish(commit: boolean) {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = 0;
    }
    this.#autoScroll.cancel();

    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("touchmove", this.#blockTouch);
    window.removeEventListener("pointermove", this.#move);
    window.removeEventListener("pointerup", this.#endDrop);
    window.removeEventListener("pointercancel", this.#cancelDrop);
    selectionEnd();

    const willDrop = commit && this.#validSlot && this.taskIds.length > 0 && this.onDrop !== null;
    if (willDrop) {
      tapMedium();
      this.onDrop?.({
        taskIds: this.taskIds.slice(),
        from: this.fromList as string,
        to: this.overList as string,
        index: this.overIndex,
      });
    }

    const hadActiveDrag = this.taskIds.length > 0;
    this.taskIds = [];
    this.fromList = null;
    this.overList = null;
    this.#validSlot = false;

    if (hadActiveDrag) suppressNextClick();
  }
}

export const dnd = new Dnd();
