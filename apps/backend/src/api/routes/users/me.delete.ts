import { createError } from "h3";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(async ({ user }) => {
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  await prisma.user.delete({ where: { id: user.id } });
  return { ok: true };
});
