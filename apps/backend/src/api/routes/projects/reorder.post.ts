import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

export default handler(
  {
    body: {
      items: z.array(z.object({ id: z.string().min(1), order: z.number() })),
    },
  },
  async ({ user, body: { items } }) => {
    requireAuth(user);
    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.project.updateMany({ where: { id, userId: user.id }, data: { order } }),
      ),
    );
    return { ok: true };
  },
);
