import { applyProjectOp } from "./apply-project";
import { applyTaskOp } from "./apply-task";
import type { OpInput, OpResult } from "./schemas";

export { Op, type OpInput, type OpResult } from "./schemas";

export async function applyOp(userId: string, op: OpInput): Promise<OpResult> {
  try {
    if (op.kind.startsWith("task.")) {
      return await applyTaskOp(userId, op as Extract<OpInput, { kind: `task.${string}` }>);
    }
    return await applyProjectOp(userId, op as Extract<OpInput, { kind: `project.${string}` }>);
  } catch (err) {
    return { ok: false, reason: "error", detail: (err as Error).message };
  }
}
