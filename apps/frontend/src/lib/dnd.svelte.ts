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
  // Cleared when the finger is not over any registered list; gates whether
  // pointerup commits the drop. Otherwise releasing the finger over a
  // header / FAB / status bar would silently drop into the most recently
  // hovered list at a stale index.
  private validSlot = false;

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
    this.validSlot = true;
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
    window.addEventListener("pointerup", this.endDrop);
    window.addEventListener("pointercancel", this.cancelDrop);
    // Recompute the drop slot immediately so a drag that starts already over
    // a valid index isn't misreported as "before slot 0" until the next move.
    this.recomputeDropSlot();
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
    // Only spin the auto-scroll rAF while the finger is actually inside an
    // edge zone — running it every frame for the duration of every drag is
    // wasted work on low-end devices.
    if (this.inEdgeZone(ev.clientY)) this.startAutoScroll();
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
    if (!listEl) {
      this.validSlot = false;
      return;
    }
    this.validSlot = true;

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

  // Use the visualViewport when available — iOS Safari's URL bar collapses
  // and expands during scroll, and `innerHeight` lags the actual visible
  // area during the transition. The visualViewport reflects what the user
  // can really see, which is what "near the edge" should mean.
  private viewportHeight() {
    return window.visualViewport?.height ?? window.innerHeight;
  }

  private inEdgeZone(y: number) {
    return y < EDGE_ZONE || y > this.viewportHeight() - EDGE_ZONE;
  }

  private startAutoScroll() {
    if (this.scrollRafId) return;
    this.lastScrollTs = performance.now();
    this.scrollRafId = requestAnimationFrame(this.autoScroll);
  }

  // Edge auto-scroll. Self-arms only while the finger is inside an edge zone
  // (gated by `startAutoScroll`); exits the loop as soon as the finger
  // leaves the zone so we don't spin a rAF for the entire drag.
  private autoScroll = (ts: number) => {
    this.scrollRafId = 0;
    if (!this.active) return;
    const dtMs = Math.min(64, ts - this.lastScrollTs);
    this.lastScrollTs = ts;

    const vh = this.viewportHeight();
    const y = this.pendingY;
    let dy = 0;
    if (y < EDGE_ZONE) {
      const f = (EDGE_ZONE - y) / EDGE_ZONE; // 0 → 1 as finger approaches top
      dy = -EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    } else if (y > vh - EDGE_ZONE) {
      const f = (y - (vh - EDGE_ZONE)) / EDGE_ZONE;
      dy = EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    }

    if (dy === 0) return; // left the zone — stop spinning

    // Normalise speed to 60fps so a janky frame doesn't undershoot.
    // Assumes the task lists live in the root document scroller (true
    // for the current layout — RangeSection/DailySection/UnscheduledSection
    // are direct children of +page.svelte under document scroll). If a
    // future list lands in a nested scroll container, walk up from
    // elementFromPoint to find the nearest scrollable ancestor instead.
    window.scrollBy(0, dy * (dtMs / (1000 / 60)));
    // The list element under the finger may now be different — the drop
    // slot needs to follow the moving viewport even though pendingX/Y
    // haven't changed.
    this.recomputeDropSlot();
    this.scrollRafId = requestAnimationFrame(this.autoScroll);
  };

  // `pointerup` → commit the drop. The pointer event carries the final
  // coords, which we trust over the last rAF state.
  private endDrop = (ev: PointerEvent) => {
    this.pendingX = ev.clientX;
    this.pendingY = ev.clientY;
    this.recomputeDropSlot();
    this.finish(true);
  };

  // `pointercancel` → the OS took the gesture away (e.g., a system gesture
  // interrupted, or the touch was hijacked by a parent scroller). Discard
  // the drop rather than commit it; an OS-cancelled drag silently
  // reordering tasks would be a nasty surprise.
  private cancelDrop = () => {
    this.finish(false);
  };

  private finish(commit: boolean) {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.scrollRafId) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = 0;
    }

    document.documentElement.classList.remove("dnd-dragging");
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.endDrop);
    window.removeEventListener("pointercancel", this.cancelDrop);
    selectionEnd();

    const onDrop = this.onDrop;
    const fromList = this.fromList;
    const overList = this.overList;
    // Drop only when committed AND the finger is over a registered list.
    // Releasing over a header / FAB / status bar should not silently land
    // the drag into the most recently hovered list.
    const willDrop = commit && this.validSlot && this.taskIds.length > 0 && onDrop !== null;
    if (willDrop) {
      tapMedium();
      onDrop({
        taskIds: this.taskIds.slice(),
        from: fromList as string,
        to: overList as string,
        index: this.overIndex,
      });
    }

    const hadActiveDrag = this.taskIds.length > 0;
    this.taskIds = [];
    this.fromList = null;
    this.overList = null;
    this.validSlot = false;

    // iOS and some Androids fire a synthetic `click` on pointerup. That
    // click would land on whatever is under the finger at release and
    // could (e.g.) put a task into edit mode. Suppress on any real drag —
    // including cancels and drops outside any list — so the click-through
    // bug can't slip through one of those paths. 300ms covers Android's
    // legacy synthetic-click delay; missing one stray tap is preferable
    // to letting the original bug back in.
    if (hadActiveDrag) suppressNextClick();
  }
}

function suppressNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener("click", swallow, true);
  };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true), 300);
}

export const dnd = new Dnd();
