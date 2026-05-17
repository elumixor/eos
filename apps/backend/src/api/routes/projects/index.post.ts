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
    },
  },
  async ({ body: { name, avatarType, emoji, image } }) => {
    const existing = await prisma.project.findUnique({ where: { name } });
    if (existing) return existing;

    return prisma.project.create({
      data: { name, avatarType: avatarType ?? "auto", emoji, image },
    });
  },
);
