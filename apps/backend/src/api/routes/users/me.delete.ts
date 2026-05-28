import { createError } from "h3";
import { trackEvent } from "services/analytics";
import { prisma } from "services/prisma";
import { handler } from "utils";

export default handler(async ({ user }) => {
  if (!user) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  // Track BEFORE the cascade delete — once the user row is gone the FK
  // would null out the userId, losing attribution.
  await trackEvent("account_deleted", user.id, { wasAnonymous: !user.email });
  await prisma.user.delete({ where: { id: user.id } });
  return { ok: true };
});
