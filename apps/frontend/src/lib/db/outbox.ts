import type { Bucket } from "$lib/api";
import { withStore } from "./idb";

// Mutation queue. Each op describes a server-bound change. Optimistic UI is
// applied immediately to the local stores; ops sit here until the sync
// runner drains them via POST /api/sync/push.
//
// Status lifecycle: pending → inflight (set when included in a push batch)
// → removed on success, or → failed on terminal error (kept for inspection).

export type Op =
  | { kind: "task.create"; id: string; text: string; bucket?: Bucket;
      scheduledAt?: string | null; projectId?: string | null;
      startTime?: string | null; duration?: number | null; order?: number;
      completed?: boolean }
  | { kind: "task.update"; id: string; clientUpdatedAt: string;
      patch: Partial<{
        text: string; completed: boolean; order: number; bucket: Bucket;
        scheduledAt: string | null; projectId: string | null;
        startTime: string | null; duration: number | null;
      }> }
  | { kind: "task.delete"; id: string; clientUpdatedAt: string }
  | { kind: "task.restore"; id: string }
  | { kind: "task.reorder"; items: { id: string; order: number; bucket: Bucket }[] }
  | { kind: "project.create"; id: string; name: string;
      avatarType?: "auto" | "emoji" | "image"; emoji?: string | null;
      image?: string | null; hue?: number | null; hidden?: boolean;
      capitalization?: "sentence" | "lower" | "capitalized" | "upper";
      order?: number; parentIds?: string[] }
  | { kind: "project.update"; id: string; clientUpdatedAt: string;
      patch: Partial<{
        name: string; avatarType: "auto" | "emoji" | "image";
        emoji: string | null; image: string | null; hue: number | null;
        hidden: boolean; capitalization: "sentence" | "lower" | "capitalized" | "upper";
        order: number; parentIds: string[];
      }> }
  | { kind: "project.delete"; id: string; clientUpdatedAt: string };

export type OutboxEntry = {
  seq?: number; // assigned by IDB autoIncrement
  status: "pending" | "inflight" | "failed";
  createdAt: number;
  op: Op;
};

export async function enqueue(op: Op): Promise<void> {
  await withStore("outbox", "readwrite", (s) =>
    s.add({ status: "pending", createdAt: Date.now(), op } as OutboxEntry),
  );
}

export async function listPending(): Promise<OutboxEntry[]> {
  return withStore<OutboxEntry[]>("outbox", "readonly", (s) =>
    s.getAll() as IDBRequest<OutboxEntry[]>,
  ).then((rows) => rows.filter((r) => r.status !== "failed"));
}

export async function markInflight(seqs: number[]): Promise<void> {
  if (!seqs.length) return;
  await withStore("outbox", "readwrite", async (s) => {
    for (const seq of seqs) {
      const req = s.get(seq);
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
          const row = req.result as OutboxEntry | undefined;
          if (row) {
            row.status = "inflight";
            s.put(row);
          }
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
  });
}

export async function remove(seqs: number[]): Promise<void> {
  if (!seqs.length) return;
  await withStore("outbox", "readwrite", (s) => {
    for (const seq of seqs) s.delete(seq);
  });
}

export async function markFailed(seq: number, detail?: string): Promise<void> {
  await withStore("outbox", "readwrite", (s) => {
    const req = s.get(seq);
    req.onsuccess = () => {
      const row = req.result as OutboxEntry | undefined;
      if (!row) return;
      row.status = "failed";
      (row as OutboxEntry & { failedDetail?: string }).failedDetail = detail;
      s.put(row);
    };
  });
}
