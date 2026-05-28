// Pointer pipeline for a draggable task row.
//
// Web (mouse): pointerdown + any movement → start drag. pointerup with no
// movement → tap. Right-click → context menu (caller handles).
// Touch/pen: long-press (450ms held still) → open context menu and arm drag.
// After arming, movement closes the menu and starts the drag. A plain tap
// (no long-press) → tap.

const LONG_PRESS_MS = 450;
const MOVE_START_PX = 5;
const MOVE_TAP_PX = 6;

export type GestureHandlers = {
  startDrag: (x: number, y: number, pointerId: number) => void;
  openLongPressMenu: () => void;
  closeLongPressMenu: () => void;
  tap: (mods: { shift: boolean; meta: boolean }) => void;
  onPointerCapture?: (pointerId: number) => void;
  shouldIgnore: (e: PointerEvent) => boolean;
};

// iOS only honours preventDefault on the *first* touchmove of a gesture,
// so the scroll blocker must be installed at pointerdown — before any
// movement — to keep the page from panning during a long-press.
function createScrollBlocker() {
  let armed = false;
  const block = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault();
  };
  return {
    arm() {
      if (armed) return;
      window.addEventListener("touchmove", block, { passive: false });
      armed = true;
    },
    disarm() {
      if (!armed) return;
      window.removeEventListener("touchmove", block);
      armed = false;
    },
  };
}

export function createGesture(h: GestureHandlers) {
  let active = false;
  let hadDown = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpFired = false;
  let modShift = false;
  let modMeta = false;
  const scroll = createScrollBlocker();

  const clearLp = () => {
    if (lpTimer) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  };

  return {
    onDown(e: PointerEvent) {
      e.stopPropagation();
      if (h.shouldIgnore(e) || e.button === 2) return;
      active = true;
      hadDown = true;
      lpFired = false;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      modShift = e.shiftKey;
      modMeta = e.metaKey || e.ctrlKey;
      clearLp();
      if (e.pointerType !== "mouse") {
        scroll.arm();
        lpTimer = setTimeout(() => {
          if (!active) return;
          lpFired = true;
          h.openLongPressMenu();
        }, LONG_PRESS_MS);
      }
    },
    onMove(e: PointerEvent) {
      if (!active) return;
      lastX = e.clientX;
      lastY = e.clientY;
      const moved = Math.abs(e.clientX - startX) > MOVE_START_PX || Math.abs(e.clientY - startY) > MOVE_START_PX;
      if (!moved) return;
      if (e.pointerType === "mouse") {
        active = false;
        scroll.disarm();
        h.startDrag(e.clientX, e.clientY, e.pointerId);
        return;
      }
      // Touch/pen: movement before long-press → let browser scroll.
      if (!lpFired) {
        active = false;
        clearLp();
        scroll.disarm();
        return;
      }
      // Touch/pen after long-press: close menu and start drag.
      active = false;
      h.closeLongPressMenu();
      scroll.disarm();
      h.startDrag(e.clientX, e.clientY, e.pointerId);
    },
    onUp(e: PointerEvent) {
      const wasDown = hadDown;
      const wasLp = lpFired;
      active = false;
      hadDown = false;
      lpFired = false;
      clearLp();
      scroll.disarm();
      h.onPointerCapture?.(e.pointerId);
      if (!wasDown) return;
      const moved = Math.abs(lastX - startX) > MOVE_TAP_PX || Math.abs(lastY - startY) > MOVE_TAP_PX;
      if (moved || wasLp) return;
      h.tap({ shift: modShift, meta: modMeta });
    },
    onCancel(e: PointerEvent) {
      active = false;
      hadDown = false;
      lpFired = false;
      clearLp();
      scroll.disarm();
      h.onPointerCapture?.(e.pointerId);
    },
  };
}
