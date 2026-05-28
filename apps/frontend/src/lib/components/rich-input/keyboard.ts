import { killPillBackward } from "./editor-dom";

type Handlers = {
  open: () => boolean;
  active: { get: () => number; set: (n: number) => void };
  itemsLen: () => number;
  choose: (i: number) => void;
  close: () => void;
  editor: () => HTMLElement | undefined;
  onInput: () => void;
  submit: () => void;
  isTouch: () => boolean;
  onTabNav?: (dir: 1 | -1) => void;
};

export function buildEditorKeydown(h: Handlers): (e: KeyboardEvent) => void {
  return (e) => {
    if (h.open()) {
      const len = h.itemsLen();
      const cur = h.active.get();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        h.active.set((cur + 1) % len);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        h.active.set((cur - 1 + len) % len);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        h.choose(cur);
      } else if (e.key === "Escape") {
        e.preventDefault();
        h.close();
      }
      return;
    }
    const editor = h.editor();
    if (e.key === "Backspace" && editor && killPillBackward(editor)) {
      e.preventDefault();
      h.onInput();
      return;
    }
    if (e.key === "Enter") {
      // IMEs (CJK) commit candidates with Enter — don't hijack those.
      if (e.isComposing || e.keyCode === 229) return;
      // Touch: Enter = newline. Desktop: Enter = submit, Shift+Enter = newline.
      if (h.isTouch() || e.shiftKey) {
        e.preventDefault();
        // insertLineBreak is deprecated and a no-op in some mobile WebViews —
        // fall back to insertHTML so we never lose the keystroke.
        const ok = document.execCommand("insertLineBreak");
        if (!ok) document.execCommand("insertHTML", false, "<br>");
        h.onInput();
        return;
      }
      e.preventDefault();
      h.submit();
      return;
    }
    if (e.key === "Tab" && h.onTabNav) {
      e.preventDefault();
      h.submit();
      h.onTabNav(e.shiftKey ? -1 : 1);
    }
  };
}
