import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";
import { z } from "zod";

// Delta sync: returns all rows whose updatedAt is strictly greater than the
// client's `since` cursor (ISO string). Deleted rows are included with their
// deletedAt set so clients can tombstone locally.
//
// Caller passes back `serverTime` from the previous response as the next
// `since` so client clock skew is never trusted for ordering.
export default handler(
  { body: { since: z.string().optional() } },
  async ({ user, body: { since } }) => {
    requireAuth(user);
    const cursor = since ? new Date(since) : new Date(0);
    const where = { userId: user.id, updatedAt: { gt: cursor } };

    const [tasks, projects, projectParentRows] = await Promise.all([
      prisma.task.findMany({ where }),
      prisma.project.findMany({ where, include: { parents: { select: { parentId: true } } } }),
      // ProjectParent has no updatedAt; we ship all edges for each changed project.
      // (Cheap: tiny rows; covers add/remove without per-edge tracking.)
      prisma.projectParent.findMany({
        where: { child: { userId: user.id } },
        select: { childId: true, parentId: true },
      }),
    ]);

    return {
      serverTime: new Date().toISOString(),
      tasks,
      projects: projects.map(({ parents, ...rest }) => ({
        ...rest,
        parentIds: parents.map((p) => p.parentId),
      })),
      projectParents: projectParentRows,
    };
  },
);
