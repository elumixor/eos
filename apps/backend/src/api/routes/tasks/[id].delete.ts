import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(async ({ user, router }) => {
  requireAuth(user);
  await prisma.task.updateMany({
    where: { id: router.id, userId: user.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
});
