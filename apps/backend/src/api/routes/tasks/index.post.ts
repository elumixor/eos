import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      text: z.string().min(1),
      date: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
      startTime: z.string().nullable().optional(),
      duration: z.number().nullable().optional(),
    },
  },
  async ({ body: { text, date, projectId, startTime, duration } }) => {
    const maxOrder = await prisma.task.aggregate({
      where: { date: date ?? null },
      _max: { order: true },
    });

    return prisma.task.create({
      data: {
        text,
        date: date ?? null,
        projectId: projectId ?? null,
        startTime: startTime ? new Date(startTime) : null,
        duration: duration ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  },
);
