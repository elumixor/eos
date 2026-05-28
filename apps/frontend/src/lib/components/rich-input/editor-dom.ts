// Pure DOM helpers for the contenteditable editor: serialization round-trip
// (preserving pill tokens) and pill-aware backspace.

const ZWSP = /​/g;
const isBlank = (n: Node | null | undefined): boolean =>
  !!n && n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").replace(ZWSP, "") === "";

// Walk the editor DOM, converting pills back to their @token: source form
// and treating block boundaries (DIV/P/BR) as newlines.
export function canonical(root: Node): string {
  let out = "";
  const walk = (node: Node) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.textContent ?? "";
      } else if (n instanceof HTMLElement) {
        if (n.dataset.token) {
          out += ` ${n.dataset.token} `;
        } else if (n.tagName === "BR") {
          out += "\n";
        } else {
          const isBlock = n.tagName === "DIV" || n.tagName === "P";
          if (isBlock && out.length > 0 && !out.endsWith("\n")) out += "\n";
          walk(n);
        }
      }
    }
  };
  walk(root);
  return out
    .replace(ZWSP, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

export function selectionInside(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return editor.contains(r.commonAncestorContainer) ? r : null;
}

// Delete a whole pill (and surrounding zero-width spaces) in one Backspace
// when the caret sits just after it. Returns true if it handled the key.
export function killPillBackward(editor: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const c = r.startContainer;
  const o = r.startOffset;
  let prev: ChildNode | null = null;

  if (c.nodeType === Node.TEXT_NODE && editor.contains(c)) {
    const left = (c.textContent ?? "").slice(0, o);
    if (left.replace(ZWSP, "").length > 0) return false; // real text → normal delete
    prev = (c as ChildNode).previousSibling;
  } else if (c === editor) {
    prev = (editor.childNodes[o - 1] as ChildNode) ?? null;
  } else {
    return false;
  }

  while (isBlank(prev)) prev = (prev as ChildNode).previousSibling;
  if (!(prev instanceof HTMLElement) || !prev.dataset.token) return false;

  const pill = prev;
  // Select [leading zwsp?][pill][blank nodes][caret] then delete via
  // execCommand so the removal is on the native undo stack.
  const lead = pill.previousSibling;
  const del = document.createRange();
  if (isBlank(lead)) del.setStartBefore(lead as Node);
  else del.setStartBefore(pill);
  del.setEnd(c, o);
  sel.removeAllRanges();
  sel.addRange(del);
  editor.focus();
  document.execCommand("delete");
  return true;
}

// Caret context for "@query": which text node, where it starts/ends.
export type QueryContext = { node: Text; start: number; end: number; text: string } | null;

export function readQueryAtCaret(editor: HTMLElement): QueryContext {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;
  const text = (node as Text).textContent ?? "";
  const before = text.slice(0, range.startOffset);
  // Allow one inner space so "@tomorrow 19pm" / "@eiffel tower" keeps the
  // picker open. A second space (or another @) closes it.
  const m = before.match(/@([^\s@]*(?: [^\s@]*)?)$/);
  if (!m) return null;
  return {
    node: node as Text,
    start: range.startOffset - m[0].length,
    end: range.startOffset,
    text: m[1],
  };
}
