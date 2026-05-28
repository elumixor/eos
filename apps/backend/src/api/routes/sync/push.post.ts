import { requireAuth } from "services/auth";
import { applyOp, Op, type OpResult } from "services/sync";
import { handler } from "utils";
import { z } from "zod";

// Drains a client outbox. Each op is idempotent on the server; results let
// the client drop acked ops from its outbox and re-fetch fresh state on
// conflicts (via the pull half of sync).
export default handler({ body: { ops: z.array(Op) } }, async ({ user, body: { ops } }) => {
  requireAuth(user);
  const results: OpResult[] = [];
  for (const op of ops) results.push(await applyOp(user.id, op));
  return { serverTime: new Date().toISOString(), results };
});
