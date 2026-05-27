import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(({ user }) => {
  requireAuth(user);
  return prisma.task.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ bucket: "asc" }, { order: "asc" }],
  });
});
