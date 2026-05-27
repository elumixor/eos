import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

// Each project returns its parentIds as a flat string[] (DAG; a project can
// have any number of parents). Children are derived client-side.
export default handler(async ({ user }) => {
  requireAuth(user);
  const list = await prisma.project.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { parents: { select: { parentId: true } } },
  });
  return list.map(({ parents, ...rest }) => ({
    ...rest,
    parentIds: parents.map((p) => p.parentId),
  }));
});
