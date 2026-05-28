export type DropSlot = {
  listId: string | null;
  index: number;
  valid: boolean;
};

// Find the dnd list under (x, y) and the index where the dragged item
// would land. Returns valid=false when not over any list (so the caller
// knows to drop the gesture rather than commit).
//
// Hit-tests against the LI's `offsetTop`/`offsetHeight` rather than
// getBoundingClientRect because animate:flip uses transforms to interpolate
// row positions — transforms WOULD show up in the client rect, making the
// hit-test thrash mid-animation. offsetTop is the laid-out (untransformed)
// position, which is what the user perceives as the slot grid.
export function findDropSlot(x: number, y: number, draggingIds: string[]): DropSlot {
  const el = document.elementFromPoint(x, y);
  const listEl = el?.closest<HTMLElement>("[data-dnd-list]");
  if (!listEl) return { listId: null, index: 0, valid: false };

  const listTop = listEl.getBoundingClientRect().top;
  const rows = [...listEl.children].filter(
    (c): c is HTMLElement => c instanceof HTMLElement && !!c.querySelector("[data-dnd-item]"),
  );
  let postIdx = 0;
  for (const li of rows) {
    const inner = li.querySelector<HTMLElement>("[data-dnd-item]");
    const id = inner?.dataset.dndItem ?? "";
    const isDragged = draggingIds.includes(id);
    const mid = listTop + li.offsetTop + li.offsetHeight / 2;
    if (y < mid) return { listId: listEl.dataset.dndList ?? null, index: postIdx, valid: true };
    if (!isDragged) postIdx++;
  }
  return { listId: listEl.dataset.dndList ?? null, index: postIdx, valid: true };
}
