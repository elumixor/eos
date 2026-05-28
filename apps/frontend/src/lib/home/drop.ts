import type { Bucket, Task } from "$lib/api";
import { isArchived } from "$lib/archive.svelte";
import { tasks as tasksStore } from "$lib/tasks.svelte";
import type { DisplayBucket } from "$lib/tokens";

// Map a list id ("bucket:today" etc.) to the stored bucket value. Dropping
// onto Overdue moves the task back into "today" — Overdue is derived, so
// re-stamping a task as today resets its scheduledAt to now() and pulls it
// out of the overdue display.
export function bucketFromListId(listId: string): Bucket | null {
  if (!listId.startsWith("bucket:")) return null;
  const k = listId.slice("bucket:".length) as DisplayBucket;
  if (k === "overdue") return "today";
  if (k === "today" || k === "week" || k === "later") return k;
  return null;
}

export type DropCommit = {
  taskIds: string[];
  from: string;
  to: string;
  index: number;
};

export async function commitDrop({ taskIds, to, index }: DropCommit, tasks: Task[]): Promise<void> {
  const targetBucket = bucketFromListId(to);
  if (!targetBucket) return;

  const dragged = taskIds.map((id) => tasksStore.byId(id)).filter((t): t is Task => !!t);
  if (dragged.length === 0) return;

  // Build peers in the SAME order TaskList renders — pending sorted by
  // `order`, then done sorted by `updatedAt` desc.
  const draggedIds = new Set(dragged.map((t) => t.id));
  const bucketPeers = tasks.filter((t) => !draggedIds.has(t.id) && t.bucket === targetBucket && !isArchived(t));
  const pendingPeers: Task[] = [];
  const donePeers: Task[] = [];
  for (const t of bucketPeers) (t.completed ? donePeers : pendingPeers).push(t);
  pendingPeers.sort((a, b) => a.order - b.order);
  donePeers.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const visualPeers = [...pendingPeers, ...donePeers];
  const at = Math.max(0, Math.min(index, visualPeers.length));

  // No-op: same bucket, dropped right where placeholder sat.
  if (dragged.length === 1 && dragged[0].bucket === targetBucket) {
    const t = dragged[0];
    const curIdx = t.completed
      ? pendingPeers.length +
        [...donePeers, t]
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
          .indexOf(t)
      : [...pendingPeers, t].sort((a, b) => a.order - b.order).indexOf(t);
    if (curIdx === at) return;
  }

  visualPeers.splice(at, 0, ...dragged);

  for (const t of dragged) {
    if (t.bucket !== targetBucket) await tasksStore.update(t.id, { bucket: targetBucket });
  }

  // Only reorder pending; done sorts by updatedAt.
  const newPending = visualPeers.filter((t) => !t.completed);
  await tasksStore.reorder(newPending.map((t, i) => ({ id: t.id, order: i, bucket: targetBucket })));
}
