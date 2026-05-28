export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export type KeymapHandlers = {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  togglePicker: () => void;
};

// Cmd/Ctrl+Z — undo last voice turn (or redo). Cmd/Ctrl+Shift+Z — explicit
// redo. Cmd/Ctrl+K — toggle project picker. Skipped when focus is inside an
// editable so native undo still works while typing.
export function buildGlobalKeydown(h: KeymapHandlers): (e: KeyboardEvent) => void {
  return (e) => {
    if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
      if (isEditableTarget(e.target)) return;
      const wantsRedo = e.shiftKey;
      if (wantsRedo) {
        if (!h.canRedo()) return;
        e.preventDefault();
        h.onRedo();
        return;
      }
      if (h.canUndo()) {
        e.preventDefault();
        h.onUndo();
        return;
      }
      if (h.canRedo()) {
        e.preventDefault();
        h.onRedo();
      }
      return;
    }
    if (e.key !== "k" && e.key !== "K") return;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.altKey || e.shiftKey) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    h.togglePicker();
  };
}
