import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

const BUCKETS = ["today", "week", "later"] as const;

export default handler(
  {
    body: {
      items: z.array(
        z.object({
          id: z.string().min(1),
          order: z.number(),
          bucket: z.enum(BUCKETS),
        }),
      ),
    },
  },
  async ({ user, body: { items } }) => {
    requireAuth(user);
    // Reorder doesn't change scheduledAt — the bucket change (and stamp) is
    // committed by the PATCH that precedes this call. Reorder is the
    // positional cleanup only.
    await prisma.$transaction(
      items.map(({ id, order, bucket }) =>
        prisma.task.updateMany({ where: { id, userId: user.id }, data: { order, bucket } }),
      ),
    );

    return { ok: true };
  },
);
