import { trackEvent } from "services/analytics";
import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

const BUCKETS = ["today", "week", "later"] as const;

export default handler(
  {
    body: {
      text: z.string().min(1),
      bucket: z.enum(BUCKETS).optional(),
      projectId: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      duration: z.number().nullable().optional(),
    },
  },
  async ({ user, body: { text, bucket, projectId, startTime, duration } }) => {
    requireAuth(user);
    const b = bucket ?? "today";
    const maxOrder = await prisma.task.aggregate({
      where: { userId: user.id, bucket: b },
      _max: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        userId: user.id,
        text,
        bucket: b,
        scheduledAt: b === "later" ? null : new Date(),
        projectId: projectId ?? null,
        startTime: startTime ? new Date(startTime) : null,
        duration: duration ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    trackEvent("task_created", user.id, { bucket: b, source: "type" });
    return task;
  },
);
