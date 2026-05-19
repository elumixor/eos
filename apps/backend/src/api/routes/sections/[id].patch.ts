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
  ({ router, body }) =>
    prisma.section.update({
      where: { id: router.id },
      data: body,
    }),
);
