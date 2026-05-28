import type { Project } from "$lib/api";
import { projects } from "$lib/projects.svelte";
import { chipDrag } from "./chip-drag.svelte";

const MOVE_THRESHOLD = 6;
const LONG_PRESS_MS = 450;

// Chip pointerdown stays tentative until it commits to one of:
//   - drag    (pointer moved > MOVE_THRESHOLD before LONG_PRESS_MS)
//   - menu    (held still for LONG_PRESS_MS)
//   - filter  (released before either of the above fired)
export function makeChipPressHandler(onOpenMenu: (p: Project, x: number, y: number) => void) {
  return (e: PointerEvent, p: Project) => {
    if (e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;
    let down = true;
    const chip = e.currentTarget as HTMLElement;
    const timer = setTimeout(() => {
      // pressDown false means the browser cancelled the gesture (e.g. native
      // scroll committed) — we must not pop the menu.
      if (activated || !down) return;
      activated = true;
      onOpenMenu(p, startX, startY);
    }, LONG_PRESS_MS);

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      clearTimeout(timer);
      down = false;
    };
    const onMove = (me: PointerEvent) => {
      if (activated) return;
      if (Math.hypot(me.clientX - startX, me.clientY - startY) < MOVE_THRESHOLD) return;
      activated = true;
      cleanup();
      chipDrag.start(p, me.clientX, me.clientY, chip);
    };
    const onUp = () => {
      const wasActivated = activated;
      cleanup();
      if (!wasActivated) projects.toggleFilter(p.id);
    };
    const onCancel = () => cleanup();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
}
