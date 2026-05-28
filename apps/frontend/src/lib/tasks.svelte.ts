import type { Bucket, Task } from "$lib/api";
import { newId } from "$lib/db/id";
import { del, getAll, put, putMany } from "$lib/db/idb";
import { enqueue } from "$lib/db/outbox";
import { onPulled, sync } from "$lib/sync.svelte";

// Offline-first tasks store. Same pattern as projects: IDB hydrate on boot,
// optimistic local writes, enqueued ops for sync. Bucket-based scheduling
// (today | week | later), with scheduledAt stamped server-side when a task
// moves into today/week.

class TasksStore {
  list = $state<Task[]>([]);
  private booted = false;

  get byBucket(): Record<Bucket, Task[]> {
    const out: Record<Bucket, Task[]> = { today: [], week: [], later: [] };
    for (const t of this.list) out[t.bucket as Bucket].push(t);
    for (const b of ["today", "week", "later"] as Bucket[]) {
      out[b].sort((a, b) => a.order - b.order);
    }
    return out;
  }

  async boot() {
    if (this.booted) return;
    this.booted = true;
    const cached = await getAll<Task>("tasks");
    this.list = cached.filter((t) => !(t as Task & { deletedAt?: string | null }).deletedAt);
    onPulled(({ tasks }) => {
      if (!tasks.length) return;
      const map = new Map(this.list.map((t) => [t.id, t]));
      for (const t of tasks) {
        if ((t as Task & { deletedAt?: string | null }).deletedAt) {
          map.delete(t.id);
          continue;
        }
        // Skip if our local copy is strictly newer — a pull that landed
        // mid-flight (e.g. right after a local reorder) must not clobber
        // pending changes that haven't been pushed yet.
        const cur = map.get(t.id);
        if (cur && cur.updatedAt > t.updatedAt) continue;
        map.set(t.id, t);
      }
      this.list = Array.from(map.values());
    });
    sync.schedule(0);
  }

  byId(id: string): Task | undefined {
    return this.list.find((t) => t.id === id);
  }

  async create(input: {
    text: string;
    bucket?: Bucket;
    projectId?: string | null;
    startTime?: string | null;
    duration?: number | null;
  }): Promise<Task> {
    const id = newId();
    const now = new Date().toISOString();
    const bucket: Bucket = input.bucket ?? "today";
    const peers = this.list.filter((t) => t.bucket === bucket);
    const order = (peers.at(-1)?.order ?? -1) + 1;
    const task = {
      id,
      userId: "",
      text: input.text,
      completed: false,
      order,
      bucket,
      scheduledAt: bucket === "later" ? null : now,
      projectId: input.projectId ?? null,
      startTime: input.startTime ?? null,
      duration: input.duration ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as Task;
    this.list = [...this.list, task];
    await put("tasks", task);
    await enqueue({
      kind: "task.create",
      id,
      text: input.text,
      bucket,
      scheduledAt: task.scheduledAt as unknown as string | null,
      projectId: input.projectId ?? null,
      startTime: input.startTime ?? null,
      duration: input.duration ?? null,
      order,
    });
    sync.schedule(0);
    return task;
  }

  async update(id: string, patch: Partial<Task>): Promise<Task | undefined> {
    const cur = this.byId(id);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    // Mirror server semantics: changing bucket re-stamps scheduledAt;
    // toggling completed stamps/clears completedAt.
    const bucketChange =
      patch.bucket !== undefined && patch.bucket !== cur.bucket
        ? { scheduledAt: patch.bucket === "later" ? null : now }
        : {};
    const completionChange =
      patch.completed !== undefined && patch.completed !== cur.completed
        ? { completedAt: patch.completed ? now : null }
        : {};
    const updated = { ...cur, ...patch, ...bucketChange, ...completionChange, updatedAt: now } as Task;
    this.list = this.list.map((t) => (t.id === id ? updated : t));
    await put("tasks", updated);
    await enqueue({
      kind: "task.update",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
      patch: { ...patch, ...bucketChange } as never,
    });
    sync.schedule(0);
    return updated;
  }

  async remove(id: string) {
    const cur = this.byId(id);
    if (!cur) return;
    this.list = this.list.filter((t) => t.id !== id);
    await del("tasks", id);
    await enqueue({
      kind: "task.delete",
      id,
      clientUpdatedAt: cur.updatedAt as unknown as string,
    });
    sync.schedule(0);
  }

  // Reorder within / across buckets. Pass the full reordered slice for the
  // bucket(s) affected — each item's new order index is implicit.
  async reorder(items: { id: string; order: number; bucket: Bucket }[]) {
    const byId = new Map(this.list.map((t) => [t.id, t]));
    const now = new Date().toISOString();
    const updated: Task[] = [];
    for (const it of items) {
      const cur = byId.get(it.id);
      if (!cur) continue;
      const next = { ...cur, order: it.order, bucket: it.bucket, updatedAt: now } as Task;
      byId.set(it.id, next);
      updated.push(next);
    }
    this.list = Array.from(byId.values());
    await putMany("tasks", updated);
    await enqueue({ kind: "task.reorder", items });
    sync.schedule(0);
  }
}

export const tasks = new TasksStore();
