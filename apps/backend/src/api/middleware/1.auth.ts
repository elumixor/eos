import { defineEventHandler, getHeader } from "h3";
import { verifyJWT } from "services/auth";
import { prisma } from "services/prisma";

// Verify the JWT and confirm the user still exists. If the underlying user
// row was deleted, treat the request as unauthenticated so requireAuth()
// returns 401 — the client clears the stale token and re-bootstraps.
export default defineEventHandler(async (event) => {
  const header = getHeader(event, "authorization");
  const claim = header?.startsWith("Bearer ") ? verifyJWT(header.slice(7)) : null;
  if (!claim) {
    event.context.user = null;
    return;
  }
  const exists = await prisma.user.findUnique({ where: { id: claim.id }, select: { id: true } });
  event.context.user = exists ? claim : null;
});
