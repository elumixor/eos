import type { Bucket, Task } from "$lib/api";
import { archivePop, isArchived } from "$lib/archive.svelte";
import { selection as multi } from "$lib/selection.svelte";
import { tasks as tasksStore } from "$lib/tasks.svelte";
import { toasts } from "$lib/toast.svelte";
import { extractFields } from "$lib/tokens";

// Per-task monotonic sequence so rapid double-taps coalesce safely.
const toggleSeq = new Map<string, number>();
const confirmedToggle = new Map<string, boolean>();

export const addTask = (text: string) => tasksStore.create({ text, bucket: "today", ...extractFields(text) });

export async function toggleTask(task: Task) {
  const id = task.id;
  const target = !task.completed;
  if (!confirmedToggle.has(id)) confirmedToggle.set(id, task.completed);
  // Completing a "later" task pulls it into Today so the user sees the win.
  const promote = target && task.bucket === "later";
  const patch: Partial<Task> = promote ? { completed: target, bucket: "today" } : { completed: target };
  if (target && !promote && isArchived({ ...task, completed: true })) archivePop.bump();
  const seq = (toggleSeq.get(id) ?? 0) + 1;
  toggleSeq.set(id, seq);
  try {
    const updated = await tasksStore.update(id, patch);
    if (toggleSeq.get(id) !== seq) return;
    if (updated) confirmedToggle.set(id, updated.completed);
    toggleSeq.delete(id);
  } catch {
    if (toggleSeq.get(id) !== seq) return;
    const safe = confirmedToggle.get(id) ?? !target;
    await tasksStore.update(id, { completed: safe });
    toggleSeq.delete(id);
    toasts.error("Couldn't update task — please try again");
  }
}

export const deleteTask = (task: Task) => tasksStore.remove(task.id);

export const editTask = (task: Task, text: string) => tasksStore.update(task.id, { text, ...extractFields(text) });

export const duplicateTask = (task: Task) =>
  tasksStore.create({ text: task.text, bucket: task.bucket as Bucket, ...extractFields(task.text) });

export async function bulkDelete(ids: string[]) {
  multi.clear();
  for (const id of ids) await tasksStore.remove(id);
}

export async function bulkComplete(ids: string[], completed: boolean) {
  for (const id of ids) await tasksStore.update(id, { completed });
}
