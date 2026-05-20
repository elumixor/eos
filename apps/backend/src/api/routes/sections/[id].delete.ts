import { requireAuth } from "services/auth";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(async ({ user, router }) => {
  requireAuth(user);
  await prisma.section.deleteMany({ where: { id: router.id, userId: user.id } });
  return { ok: true };
});
