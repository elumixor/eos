import type { Project } from "$lib/api";
import { renderEditorHtml } from "$lib/pillHtml";
import { canonical, selectionInside } from "./editor-dom";

export function bindClipboard(editor: HTMLElement, projectsList: () => Project[], afterChange: () => void) {
  return {
    onCopy(e: ClipboardEvent) {
      const r = selectionInside(editor);
      if (!r) return;
      const text = canonical(r.cloneContents());
      if (!text) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", text);
    },
    onCut(e: ClipboardEvent) {
      const r = selectionInside(editor);
      if (!r) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", canonical(r.cloneContents()));
      editor.focus();
      document.execCommand("delete");
      afterChange();
    },
    onPaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      e.preventDefault();
      editor.focus();
      // Tokens become pills again; anything else is escaped plain text.
      document.execCommand("insertHTML", false, renderEditorHtml(text, projectsList()));
      afterChange();
    },
  };
}
