import { createError } from "h3";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(async ({ user }) => {
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!row) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt,
    anonymous: row.email === null,
  };
});
