import { prisma } from "services/prisma";
import type { Action } from "./schemas";

// Per-request mutator. Caches `today` max-order so multiple `create`s pack
// consecutive orders without N+1 aggregate queries.
export function createMutator(userId: string) {
  let todayMaxOrder: number | null = null;

  async function nextTodayOrder() {
    if (todayMaxOrder === null) {
      todayMaxOrder =
        (await prisma.task.aggregate({ where: { userId, bucket: "today" }, _max: { order: true } }))._max.order ?? -1;
    }
    todayMaxOrder += 1;
    return todayMaxOrder;
  }

  return {
    async applyAction(a: Action) {
      if (a.op === "create") {
        const text = a.text?.trim();
        if (!text) return null;
        return prisma.task.create({
          data: { userId, text, bucket: "today", scheduledAt: new Date(), order: await nextTodayOrder() },
        });
      }
      if (!a.id) return null;
      if (a.op === "complete")
        return prisma.task.update({ where: { id: a.id }, data: { completed: true, completedAt: new Date() } });
      if (a.op === "uncomplete")
        return prisma.task.update({ where: { id: a.id }, data: { completed: false, completedAt: null } });
      if (a.op === "edit") {
        const data: { text?: string; bucket?: string; scheduledAt?: Date | null } = {};
        const text = a.text?.trim();
        if (text) data.text = text;
        if (a.bucket) {
          data.bucket = a.bucket;
          // Bucket change re-stamps scheduledAt: today/week get "now" so the
          // task isn't immediately treated as overdue; later clears it.
          data.scheduledAt = a.bucket === "later" ? null : new Date();
        }
        if (!Object.keys(data).length) return null;
        return prisma.task.update({ where: { id: a.id }, data });
      }
      if (a.op === "delete") return prisma.task.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      return null;
    },
  };
}
