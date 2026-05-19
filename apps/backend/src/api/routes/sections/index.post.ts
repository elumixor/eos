import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      name: z.string().min(1),
      rangeKind: z.enum(["calendar", "relative", "absolute"]),
      unit: z.enum(["day", "week", "month", "year"]).nullable().optional(),
      count: z.number().int().nullable().optional(),
      offset: z.number().int().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
    },
  },
  async ({ body }) => {
    const maxOrder = await prisma.section.aggregate({ _max: { order: true } });
    return prisma.section.create({
      data: { ...body, order: (maxOrder._max.order ?? -1) + 1 },
    });
  },
);
