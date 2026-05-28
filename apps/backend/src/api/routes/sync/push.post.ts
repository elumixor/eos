import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Drains a client outbox. Each op is idempotent on the server:
//   - "create" upserts (existing id → returns server row; conflict-free since
//      clients use CUIDs that never collide across devices).
//   - "update" writes only if the row was not modified server-side after the
//      client's clientUpdatedAt; otherwise the op is rejected as "conflict"
//      and the server row stays. Last-write-wins per ROW (not per field).
//   - "delete" sets deletedAt; no-op if already deleted.
//   - "task.reorder" applies a bulk positional update transactionally.
//
// Response: per-op result so the client can drop acked ops from its outbox
// and re-fetch fresh state for conflicts (via the pull half of sync).

const BUCKETS = ["today", "week", "later"] as const;

const TaskCreate = z.object({
  kind: z.literal("task.create"),
  id: z.string().min(1),
  text: z.string(),
  completed: z.boolean().optional(),
  order: z.number().optional(),
  bucket: z.enum(BUCKETS).optional(),
  scheduledAt: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
});
const TaskUpdate = z.object({
  kind: z.literal("task.update"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
  patch: z.object({
    text: z.string().optional(),
    completed: z.boolean().optional(),
    order: z.number().optional(),
    bucket: z.enum(BUCKETS).optional(),
    scheduledAt: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
  }),
});
const TaskDelete = z.object({
  kind: z.literal("task.delete"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
});
const TaskRestore = z.object({
  kind: z.literal("task.restore"),
  id: z.string().min(1),
});
const TaskReorder = z.object({
  kind: z.literal("task.reorder"),
  items: z.array(
    z.object({ id: z.string().min(1), order: z.number(), bucket: z.enum(BUCKETS) }),
  ),
});
const ProjectCreate = z.object({
  kind: z.literal("project.create"),
  id: z.string().min(1),
  name: z.string().min(1),
  avatarType: z.enum(["auto", "emoji", "image"]).optional(),
  emoji: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  hue: z.number().int().min(0).max(360).nullable().optional(),
  hidden: z.boolean().optional(),
  capitalization: z.enum(["sentence", "lower", "capitalized", "upper"]).optional(),
  order: z.number().optional(),
  parentIds: z.array(z.string()).optional(),
});
const ProjectUpdate = z.object({
  kind: z.literal("project.update"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
  patch: z.object({
    name: z.string().min(1).optional(),
    avatarType: z.enum(["auto", "emoji", "image"]).optional(),
    emoji: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    hue: z.number().int().min(0).max(360).nullable().optional(),
    hidden: z.boolean().optional(),
    capitalization: z.enum(["sentence", "lower", "capitalized", "upper"]).optional(),
    order: z.number().optional(),
    parentIds: z.array(z.string()).optional(),
  }),
});
const ProjectDelete = z.object({
  kind: z.literal("project.delete"),
  id: z.string().min(1),
  clientUpdatedAt: z.string(),
});

const Op = z.union([
  TaskCreate,
  TaskUpdate,
  TaskDelete,
  TaskRestore,
  TaskReorder,
  ProjectCreate,
  ProjectUpdate,
  ProjectDelete,
]);
type OpInput = z.infer<typeof Op>;
type OpResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "not_found" | "error"; detail?: string };

async function applyOp(userId: string, op: OpInput): Promise<OpResult> {
  try {
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
        if (cur.updatedAt > new Date(op.clientUpdatedAt))
          return { ok: false, reason: "conflict" };
        const { startTime, scheduledAt, completed, ...rest } = op.patch;
        // Derive completedAt server-side from the transition so it can't be
        // forged by a client and stays monotonic across edits.
        let completedAtPatch: { completedAt: Date | null } | object = {};
        if (completed !== undefined && completed !== cur.completed) {
          completedAtPatch = { completedAt: completed ? new Date() : null };
        }
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
      case "project.create": {
        await prisma.project.upsert({
          where: { id: op.id },
          create: {
            id: op.id,
            userId,
            name: op.name,
            avatarType: op.avatarType ?? "auto",
            emoji: op.emoji ?? null,
            image: op.image ?? null,
            hue: op.hue ?? null,
            hidden: op.hidden ?? false,
            capitalization: op.capitalization ?? "sentence",
            order: op.order ?? 0,
            parents: op.parentIds?.length
              ? { create: op.parentIds.map((pid) => ({ parentId: pid })) }
              : undefined,
          },
          update: {},
        });
        return { ok: true };
      }
      case "project.update": {
        const cur = await prisma.project.findFirst({ where: { id: op.id, userId } });
        if (!cur) return { ok: false, reason: "not_found" };
        if (cur.updatedAt > new Date(op.clientUpdatedAt))
          return { ok: false, reason: "conflict" };
        const { parentIds, ...scalar } = op.patch;
        if (parentIds !== undefined) {
          await prisma.$transaction([
            prisma.projectParent.deleteMany({ where: { childId: op.id } }),
            ...(parentIds.length
              ? [
                  prisma.projectParent.createMany({
                    data: parentIds.map((pid) => ({ childId: op.id, parentId: pid })),
                  }),
                ]
              : []),
          ]);
        }
        await prisma.project.update({ where: { id: op.id }, data: scalar });
        return { ok: true };
      }
      case "project.delete": {
        const cur = await prisma.project.findFirst({ where: { id: op.id, userId } });
        if (!cur) return { ok: false, reason: "not_found" };
        if (cur.deletedAt) return { ok: true };
        await prisma.project.update({ where: { id: op.id }, data: { deletedAt: new Date() } });
        return { ok: true };
      }
    }
  } catch (err) {
    return { ok: false, reason: "error", detail: (err as Error).message };
  }
}

export default handler(
  { body: { ops: z.array(Op) } },
  async ({ user, body: { ops } }) => {
    requireAuth(user);
    const results: OpResult[] = [];
    for (const op of ops) results.push(await applyOp(user.id, op));
    return { serverTime: new Date().toISOString(), results };
  },
);
