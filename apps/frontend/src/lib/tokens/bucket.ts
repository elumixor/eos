export type Bucket = "today" | "week" | "later";

// What the user sees: the stored bucket may roll into "overdue" if its
// scheduled stamp is older than the current period (calendar day for
// "today", current week for "week"). "later" never rolls over.
export type DisplayBucket = Bucket | "overdue";

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Monday-start week. Returns 00:00 on Monday of the week containing d.
function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  const offset = (c.getDay() + 6) % 7; // days since Monday
  c.setDate(c.getDate() - offset);
  return c;
}

export function displayBucket(
  task: { bucket: string; scheduledAt: string | Date | null; completed: boolean },
  now = new Date(),
): DisplayBucket {
  const b = task.bucket as Bucket;
  if (b === "later" || task.completed || !task.scheduledAt) {
    return b === "today" || b === "week" ? b : "later";
  }
  const sched = typeof task.scheduledAt === "string" ? new Date(task.scheduledAt) : task.scheduledAt;
  if (b === "today") return sched < startOfDay(now) ? "overdue" : "today";
  return sched < startOfWeek(now) ? "overdue" : "week";
}
