import { createError } from "h3";
import { trackEvent } from "services/analytics";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

const BUCKETS = ["today", "week", "later"] as const;

export default handler(
  {
    body: {
      text: z.string().min(1).optional(),
      completed: z.boolean().optional(),
      order: z.number().optional(),
      bucket: z.enum(BUCKETS).optional(),
      projectId: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      duration: z.number().nullable().optional(),
    },
  },
  async ({ user, router, body }) => {
    requireAuth(user);
    const { startTime, bucket, ...rest } = body;
    const result = await prisma.task.updateMany({
      where: { id: router.id, userId: user.id },
      data: {
        ...rest,
        ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
        // Re-stamp scheduledAt whenever the bucket changes: today/week get
        // "now" so overdue resets, later clears it.
        ...(bucket !== undefined ? { bucket, scheduledAt: bucket === "later" ? null : new Date() } : {}),
      },
    });
    if (result.count === 0) throw createError({ statusCode: 404, statusMessage: "Task not found" });
    if (body.completed === true) trackEvent("task_completed", user.id);
    return prisma.task.findUniqueOrThrow({ where: { id: router.id } });
  },
);
