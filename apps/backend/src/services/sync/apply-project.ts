import { prisma } from "services/prisma";
import type { OpInput, OpResult } from "./schemas";

export async function applyProjectOp(
  userId: string,
  op: Extract<OpInput, { kind: `project.${string}` }>,
): Promise<OpResult> {
  switch (op.kind) {
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
          parents: op.parentIds?.length ? { create: op.parentIds.map((pid) => ({ parentId: pid })) } : undefined,
        },
        update: {},
      });
      return { ok: true };
    }
    case "project.update": {
      const cur = await prisma.project.findFirst({ where: { id: op.id, userId } });
      if (!cur) return { ok: false, reason: "not_found" };
      if (cur.updatedAt > new Date(op.clientUpdatedAt)) return { ok: false, reason: "conflict" };
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
}
