// Multi-select state shared across the task list. Selection is set-of-task-ids
// plus a `last` anchor for shift-range. The anchor's listId is tracked so a
// shift-click only ranges when both ends live in the same list (cross-list
// shift would have ambiguous order).

import { SvelteSet } from "svelte/reactivity";

class Selection {
  ids = new SvelteSet<string>();
  anchorId = $state<string | null>(null);
  anchorListId = $state<string | null>(null);

  has(id: string) {
    return this.ids.has(id);
  }
  get size() {
    return this.ids.size;
  }
  get list() {
    return [...this.ids];
  }
  get active() {
    return this.ids.size > 0;
  }

  clear() {
    this.ids.clear();
    this.anchorId = null;
    this.anchorListId = null;
  }

  setSingle(id: string, listId: string) {
    this.ids.clear();
    this.ids.add(id);
    this.anchorId = id;
    this.anchorListId = listId;
  }

  toggle(id: string, listId: string) {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.anchorId = id;
    this.anchorListId = listId;
  }

  rangeFromAnchor(orderedIds: string[], id: string, listId: string) {
    if (this.anchorListId !== listId || !this.anchorId) {
      this.setSingle(id, listId);
      return;
    }
    const a = orderedIds.indexOf(this.anchorId);
    const b = orderedIds.indexOf(id);
    if (a < 0 || b < 0) {
      this.setSingle(id, listId);
      return;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    this.ids.clear();
    for (let i = lo; i <= hi; i++) this.ids.add(orderedIds[i]);
    // Anchor stays where it was so further shift-clicks pivot off it.
  }
}

export const selection = new Selection();
