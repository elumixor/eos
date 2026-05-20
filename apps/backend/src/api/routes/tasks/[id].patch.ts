import { createError } from "h3";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      text: z.string().min(1).optional(),
      completed: z.boolean().optional(),
      order: z.number().optional(),
      date: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      duration: z.number().nullable().optional(),
    },
  },
  async ({ user, router, body }) => {
    requireAuth(user);
    const { startTime, ...rest } = body;
    const result = await prisma.task.updateMany({
      where: { id: router.id, userId: user.id },
      data: {
        ...rest,
        ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
      },
    });
    if (result.count === 0) throw createError({ statusCode: 404, statusMessage: "Task not found" });
    return prisma.task.findUniqueOrThrow({ where: { id: router.id } });
  },
);
