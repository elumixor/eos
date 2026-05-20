import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      name: z.string().min(1),
      avatarType: z.enum(["auto", "emoji", "image"]).optional(),
      emoji: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      hue: z.number().int().min(0).max(360).nullable().optional(),
      hidden: z.boolean().optional(),
      capitalization: z.enum(["sentence", "lower", "capitalized", "upper"]).optional(),
      parentIds: z.array(z.string()).optional(),
    },
  },
  async ({ user, body: { name, avatarType, emoji, image, hue, hidden, capitalization, parentIds } }) => {
    requireAuth(user);
    const existing = await prisma.project.findUnique({
      where: { userId_name: { userId: user.id, name } },
      include: { parents: { select: { parentId: true } } },
    });
    if (existing) {
      const { parents, ...rest } = existing;
      return { ...rest, parentIds: parents.map((p) => p.parentId) };
    }

    const created = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        avatarType: avatarType ?? "auto",
        emoji,
        image,
        hue,
        hidden: hidden ?? false,
        capitalization: capitalization ?? "sentence",
        parents: parentIds?.length
          ? { create: parentIds.map((parentId) => ({ parentId })) }
          : undefined,
      },
      include: { parents: { select: { parentId: true } } },
    });
    const { parents, ...rest } = created;
    return { ...rest, parentIds: parents.map((p) => p.parentId) };
  },
);
