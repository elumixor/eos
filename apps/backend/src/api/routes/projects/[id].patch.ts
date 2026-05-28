import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      name: z.string().min(1).optional(),
      avatarType: z.enum(["auto", "emoji", "image"]).optional(),
      emoji: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      hue: z.number().int().min(0).max(360).nullable().optional(),
      hidden: z.boolean().optional(),
      capitalization: z.enum(["sentence", "lower", "capitalized", "upper"]).optional(),
      parentIds: z.array(z.string()).optional(),
    },
  },
  async ({ user, router, body }) => {
    requireAuth(user);
    const { parentIds, ...scalar } = body;

    const owner = await prisma.project.findFirst({
      where: { id: router.id, userId: user.id },
      select: { id: true },
    });
    if (!owner) throw createError({ statusCode: 404, statusMessage: "Project not found" });

    // DAG cycle guard: for each proposed parent, walking up its ancestors
    // must not reach this project.
    if (parentIds?.length) {
      if (parentIds.includes(router.id)) throw new Error("A project cannot be its own parent");
      const edges = await prisma.projectParent.findMany({
        where: { child: { userId: user.id } },
        select: { childId: true, parentId: true },
      });
      const parentsOf = new Map<string, string[]>();
      for (const e of edges) {
        const list = parentsOf.get(e.childId);
        if (list) list.push(e.parentId);
        else parentsOf.set(e.childId, [e.parentId]);
      }
      const seen = new Set<string>();
      const stack = [...parentIds];
      while (stack.length) {
        const cur = stack.pop();
        if (cur === undefined) break;
        if (cur === router.id) throw new Error("Cycle: a project cannot be its own ancestor");
        if (seen.has(cur)) continue;
        seen.add(cur);
        const ups = parentsOf.get(cur);
        if (ups) stack.push(...ups);
      }
    }

    // Replace-all semantics for parents when the field is provided.
    if (parentIds !== undefined) {
      await prisma.$transaction([
        prisma.projectParent.deleteMany({ where: { childId: router.id } }),
        ...(parentIds.length
          ? [
              prisma.projectParent.createMany({
                data: parentIds.map((parentId) => ({ childId: router.id, parentId })),
              }),
            ]
          : []),
      ]);
    }

    const updated = await prisma.project.update({
      where: { id: router.id },
      data: scalar,
      include: { parents: { select: { parentId: true } } },
    });
    const { parents, ...rest } = updated;
    return { ...rest, parentIds: parents.map((p) => p.parentId) };
  },
);
