import type { Task } from "$lib/api";
import { displayBucket } from "$lib/tokens";

// A completed task lives in the archive when, ignoring its completion,
// it would NOT be displayed in the active today/week sections. So:
//   bucket=later                              → archive on done
//   bucket=today/week + scheduledAt is stale  → archive on done (overdue)
//   bucket=today/week + scheduledAt is fresh  → stays in section
export function isArchived(t: Task, now = new Date()): boolean {
  if (!t.completed) return false;
  const eb = displayBucket({ ...t, completed: false }, now);
  return eb === "overdue" || eb === "later";
}

// Pop signal: increments each time a task transitions into the archive,
// so the header button can scale-pop without prop-drilling.
class ArchivePop {
  tick = $state(0);
  bump() {
    this.tick++;
  }
}
export const archivePop = new ArchivePop();
