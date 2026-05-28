import { prisma } from "services/prisma";
import type { OpInput, OpResult } from "./schemas";

// Each task op is idempotent on the server. Create upserts (clients use
// CUIDs that don't collide). Update is rejected as "conflict" if the row
// changed server-side after the client's clientUpdatedAt — last-write-wins
// per ROW (not per field).
export async function applyTaskOp(userId: string, op: Extract<OpInput, { kind: `task.${string}` }>): Promise<OpResult> {
  switch (op.kind) {
    case "task.create": {
      await prisma.task.upsert({
        where: { id: op.id },
        create: {
          id: op.id,
          userId,
          text: op.text,
          completed: op.completed ?? false,
          completedAt: op.completed ? new Date() : null,
          order: op.order ?? 0,
          bucket: op.bucket ?? "later",
          scheduledAt: op.scheduledAt ? new Date(op.scheduledAt) : null,
          projectId: op.projectId ?? null,
          startTime: op.startTime ? new Date(op.startTime) : null,
          duration: op.duration ?? null,
        },
        update: {}, // create is idempotent — existing row wins
      });
      return { ok: true };
    }
    case "task.update": {
      const cur = await prisma.task.findFirst({ where: { id: op.id, userId } });
      if (!cur) return { ok: false, reason: "not_found" };
      if (cur.updatedAt > new Date(op.clientUpdatedAt)) return { ok: false, reason: "conflict" };
      const { startTime, scheduledAt, completed, ...rest } = op.patch;
      // Derive completedAt server-side from the transition so it can't be
      // forged by a client and stays monotonic across edits.
      const completedAtPatch =
        completed !== undefined && completed !== cur.completed ? { completedAt: completed ? new Date() : null } : {};
      await prisma.task.update({
        where: { id: op.id },
        data: {
          ...rest,
          ...(completed !== undefined ? { completed } : {}),
          ...completedAtPatch,
          ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
        },
      });
      return { ok: true };
    }
    case "task.delete": {
      const cur = await prisma.task.findFirst({ where: { id: op.id, userId } });
      if (!cur) return { ok: false, reason: "not_found" };
      if (cur.deletedAt) return { ok: true };
      await prisma.task.update({ where: { id: op.id }, data: { deletedAt: new Date() } });
      return { ok: true };
    }
    case "task.restore": {
      const cur = await prisma.task.findFirst({ where: { id: op.id, userId } });
      if (!cur) return { ok: false, reason: "not_found" };
      if (!cur.deletedAt) return { ok: true };
      await prisma.task.update({ where: { id: op.id }, data: { deletedAt: null } });
      return { ok: true };
    }
    case "task.reorder": {
      await prisma.$transaction(
        op.items.map(({ id, order, bucket }) =>
          prisma.task.updateMany({ where: { id, userId }, data: { order, bucket } }),
        ),
      );
      return { ok: true };
    }
  }
}
