import { prisma } from "services/prisma";

// Merges an anonymous user's data into an existing user, then deletes the
// anonymous user. Project.order is shifted past the target's max to keep
// ordering stable when both sides had entries. Project.name is unique per
// user — on collision, append a suffix.
export async function mergeAnonymousUser(anonymousId: string, targetId: string) {
  const [projectMax, targetProjects, anonProjects] = await Promise.all([
    prisma.project.aggregate({ where: { userId: targetId }, _max: { order: true } }),
    prisma.project.findMany({ where: { userId: targetId }, select: { name: true } }),
    prisma.project.findMany({ where: { userId: anonymousId }, select: { id: true, name: true } }),
  ]);

  const projectOffset = (projectMax._max.order ?? -1) + 1;
  const targetNames = new Set(targetProjects.map((p) => p.name));

  // Rename anonymous-side projects whose name collides with one on the target.
  const renames = anonProjects
    .filter((p) => targetNames.has(p.name))
    .map((p) => ({ id: p.id, name: dedupeName(p.name, targetNames) }));

  await prisma.$transaction([
    ...renames.map((r) => prisma.project.update({ where: { id: r.id }, data: { name: r.name } })),
    prisma.project.updateMany({
      where: { userId: anonymousId },
      data: { userId: targetId, order: { increment: projectOffset } },
    }),
    prisma.task.updateMany({ where: { userId: anonymousId }, data: { userId: targetId } }),
    prisma.user.delete({ where: { id: anonymousId } }),
  ]);
}

function dedupeName(name: string, taken: Set<string>) {
  let i = 2;
  let candidate = `${name} (${i})`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${name} (${i})`;
  }
  taken.add(candidate);
  return candidate;
}
