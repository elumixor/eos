import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      name: z.string().min(1).optional(),
      rangeKind: z.enum(["calendar", "relative", "absolute"]).optional(),
      unit: z.enum(["day", "week", "month", "year"]).nullable().optional(),
      count: z.number().int().nullable().optional(),
      offset: z.number().int().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      collapsed: z.boolean().optional(),
      order: z.number().int().optional(),
    },
  },
  async ({ user, router, body }) => {
    requireAuth(user);
    const result = await prisma.section.updateMany({
      where: { id: router.id, userId: user.id },
      data: body,
    });
    if (result.count === 0) throw createError({ statusCode: 404, statusMessage: "Section not found" });
    return prisma.section.findUniqueOrThrow({ where: { id: router.id } });
  },
);
