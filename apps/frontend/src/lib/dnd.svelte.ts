// Pointer-based drag & drop shared state. Works for both touch (iOS) and mouse.
// Lists register via `data-dnd-list="<id>"`, items via `data-dnd-item="<taskId>"`.
//
// A drag carries one or more task IDs; multi-drag is used when the user starts
// dragging a task that is part of a multi-selection — the whole selection
// travels together and is dropped as a contiguous group at the drop slot.

import { selection, selectionEnd, selectionStart, tapMedium } from "$lib/haptics";

interface DropPayload {
  taskIds: string[];
  from: string;
  to: string;
  index: number;
}

// Edge auto-scroll: how close (px) to the viewport edge the finger has to be
// before the page starts scrolling, and the max speed at the very edge.
const EDGE_ZONE = 80;
const EDGE_MAX_SPEED = 14; // px per frame at the very edge

class Dnd {
  taskIds = $state<string[]>([]);
  label = $state("");
  fromList = $state<string | null>(null);
  overList = $state<string | null>(null);
  overIndex = $state(0);
  x = $state(0);
  y = $state(0);
  width = $state(0);

  onDrop: ((p: DropPayload) => void) | null = null;

  /** First / primary task being dragged. Used for the ghost preview. */
  get taskId() {
    return this.taskIds[0] ?? null;
  }
  get active() {
    return this.taskIds.length > 0;
  }
  has(id: string) {
    return this.taskIds.includes(id);
  }

  private rafId = 0;
  private scrollRafId = 0;
  private pendingX = 0;
  private pendingY = 0;
  private lastScrollTs = 0;

  // `ev` only needs the pointer position. A real PointerEvent works, but the
  // long-press path begins mid-gesture and passes the last known coords.
  start(
    taskIds: string | string[],
    label: string,
    from: string,
    ev: { clientX: number; clientY: number },
    width: number,
  ) {
    this.taskIds = Array.isArray(taskIds) ? taskIds.slice() : [taskIds];
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
    // The class also sets `touch-action: none`, which prevents the browser
    // from panning the page while we are handling pointermove ourselves.
    document.documentElement.classList.add("dnd-dragging");
    selectionStart();
    window.addEventListener("pointermove", this.move, { passive: false });
    window.addEventListener("pointerup", this.end);
    window.addEventListener("pointercancel", this.end);
    // Recompute the drop slot immediately so a drag that starts already over
    // a valid index isn't misreported as "before slot 0" until the next move.
    this.scheduleFlush();
    // Auto-scroll runs on its own rAF loop so the page can keep scrolling
    // even when the finger isn't moving — held near an edge.
    this.lastScrollTs = performance.now();
    this.scrollRafId = requestAnimationFrame(this.autoScroll);
  }

  private scheduleFlush() {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(this.flush);
  }

  // pointermove fires far faster than paint on touch devices; capture the
  // latest coords and reconcile once per frame so we never thrash reactivity.
  private move = (ev: PointerEvent) => {
    // `preventDefault` here is belt-and-braces — `touch-action: none` on the
    // root (via .dnd-dragging) is what actually stops native panning.
    if (ev.cancelable) ev.preventDefault();
    this.pendingX = ev.clientX;
    this.pendingY = ev.clientY;
    this.scheduleFlush();
  };

  private flush = () => {
    this.rafId = 0;
    if (this.taskIds.length === 0) return;

    this.x = this.pendingX;
    this.y = this.pendingY;

    this.recomputeDropSlot();
  };

  /**
   * Find the element under (pendingX, pendingY), then locate the dnd list it
   * belongs to and the index where the dragged item would land. Split out so
   * the auto-scroll loop and pointerup can both call it without going through
   * the rAF flush path.
   */
  private recomputeDropSlot() {
    const el = document.elementFromPoint(this.pendingX, this.pendingY);
    const listEl = el?.closest<HTMLElement>("[data-dnd-list]");
    if (!listEl) return;

    const prevList = this.overList;
    const prevIndex = this.overIndex;
    this.overList = listEl.dataset.dndList ?? null;

    // Items excluding any being dragged, so the index maps directly onto
    // the post-removal array.
    const items = [...listEl.querySelectorAll<HTMLElement>("[data-dnd-item]")].filter(
      (n) => !this.taskIds.includes(n.dataset.dndItem ?? ""),
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
  }

  // Edge auto-scroll. Runs every frame for the duration of the drag so the
  // page keeps scrolling even when the finger is held still inside an edge
  // zone — that's the whole point: you can reach off-screen drop targets
  // without lifting your finger.
  private autoScroll = (ts: number) => {
    if (!this.active) {
      this.scrollRafId = 0;
      return;
    }
    const dtMs = Math.min(64, ts - this.lastScrollTs);
    this.lastScrollTs = ts;

    const vh = window.innerHeight;
    const y = this.pendingY;
    let dy = 0;
    if (y < EDGE_ZONE) {
      const f = (EDGE_ZONE - y) / EDGE_ZONE; // 0 → 1 as finger approaches top
      dy = -EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    } else if (y > vh - EDGE_ZONE) {
      const f = (y - (vh - EDGE_ZONE)) / EDGE_ZONE;
      dy = EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    }

    if (dy !== 0) {
      // Normalise speed to 60fps so a janky frame doesn't undershoot.
      window.scrollBy(0, dy * (dtMs / 16.67));
      // The list element under the finger may now be different — the drop
      // slot needs to follow the moving viewport even though pendingX/Y
      // haven't changed.
      this.recomputeDropSlot();
    }

    this.scrollRafId = requestAnimationFrame(this.autoScroll);
  };

  private end = (ev: PointerEvent) => {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = 0;
    }
    // Resolve the drop target from the *current* finger position rather
    // than whatever the last rAF left behind. Otherwise a fast release
    // after a small move can land on the previous slot.
    this.pendingX = ev.clientX;
    this.pendingY = ev.clientY;
    this.recomputeDropSlot();

    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.end);
    window.removeEventListener("pointercancel", this.end);
    selectionEnd();

    const onDrop = this.onDrop;
    const fromList = this.fromList;
    const overList = this.overList;
    const hadDrop = this.taskIds.length > 0 && fromList !== null && overList !== null && onDrop !== null;
    if (hadDrop) {
      tapMedium();
      onDrop({
        taskIds: this.taskIds.slice(),
        from: fromList,
        to: overList,
        index: this.overIndex,
      });
    }

    this.taskIds = [];
    this.fromList = null;
    this.overList = null;

    // iOS and some Androids fire a synthetic `click` on pointerup after a
    // pointer sequence. If that click lands on the underlying task row, it
    // toggles edit mode on the wrong item. Swallow the first click in a
    // short window — only after a real drop, since cancelled drags don't
    // need the suppression and we don't want to break ordinary taps.
    if (hadDrop) suppressNextClick();
  };
}

function suppressNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener("click", swallow, true);
  };
  window.addEventListener("click", swallow, true);
  // Safety net — drop the listener after a short window in case no click
  // actually fires, so we don't eat an unrelated click later.
  setTimeout(() => window.removeEventListener("click", swallow, true), 400);
}

export const dnd = new Dnd();
