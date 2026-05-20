import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(({ user }) => {
  requireAuth(user);
  return prisma.section.findMany({
    where: { userId: user.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
});
