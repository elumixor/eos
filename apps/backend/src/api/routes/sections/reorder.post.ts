import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      items: z.array(z.object({ id: z.string().min(1), order: z.number() })),
    },
  },
  async ({ body: { items } }) => {
    await prisma.$transaction(items.map(({ id, order }) => prisma.section.update({ where: { id }, data: { order } })));
    return { ok: true };
  },
);
