import { prisma } from "services/prisma";
import { z } from "zod";
import type { VoiceEvent } from "./events";
import { createMutator } from "./mutator";
import { type Action, actionSchema, applySchema, recordSchema } from "./schemas";
import { buildScopedQuery, isReadOnlySql, normaliseRows } from "./sql";

export type ToolsContext = {
  userId: string;
  clientDate: string;
  localShift: string;
  yieldQueue: VoiceEvent[];
};

export function buildTools(ctx: ToolsContext) {
  const { userId, clientDate, localShift, yieldQueue } = ctx;
  const { applyAction } = createMutator(userId);
  let actionsApplied = 0;

  const tools = {
    query: {
      description:
        "Run a read-only SQL SELECT against the user's data. The Task table is auto-scoped to the current user and excludes deleted rows. Use DATE() for day comparisons.",
      inputSchema: z.object({
        sql: z.string().describe("A single SELECT (or WITH … SELECT) statement. No semicolons, no writes, no PRAGMA."),
      }),
      execute: async ({ sql }: { sql: string }) => {
        if (!isReadOnlySql(sql)) {
          console.warn("[voice.query] rejected non-readonly sql", { userId, sql });
          return {
            error: "Rejected: only a single SELECT or WITH…SELECT is allowed. No semicolons or write keywords.",
            rejectedSql: sql,
          };
        }
        const scoped = buildScopedQuery(sql, { userId, localShift, clientDate });
        const t0 = Date.now();
        try {
          const rows = await prisma.$queryRawUnsafe<unknown[]>(scoped);
          const normalised = normaliseRows(rows);
          console.info("[voice.query] ok", { userId, ms: Date.now() - t0, rowCount: normalised.length, sql });
          return { rows: normalised, rowCount: normalised.length };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[voice.query] failed", {
            userId,
            ms: Date.now() - t0,
            sql,
            scoped,
            error: message,
            stack: err instanceof Error ? err.stack : undefined,
          });
          // Return the actual error to the model so it can adjust its query.
          return { error: message, attemptedSql: sql };
        }
      },
    },
    apply: {
      description:
        "Apply a list of mutations to the user's tasks. Returns per-action results — check them before writing the reply.",
      inputSchema: applySchema,
      execute: async ({ actions }: { actions: Action[] }) => {
        const results: {
          index: number;
          op: Action["op"];
          id?: string;
          status: "ok" | "failed" | "skipped";
          taskId?: string;
          error?: string;
        }[] = [];
        for (let i = 0; i < actions.length; i++) {
          const validated = actionSchema.safeParse(actions[i]);
          if (!validated.success) {
            const err = validated.error.issues.map((iss) => iss.message).join("; ");
            console.warn("[voice.apply] invalid action", {
              userId,
              index: i,
              candidate: actions[i],
              issues: validated.error.issues,
            });
            results.push({
              index: i,
              op: (actions[i] as { op?: Action["op"] })?.op ?? "create",
              status: "failed",
              error: `Invalid action: ${err}`,
            });
            continue;
          }
          const a = validated.data;
          try {
            const task = await applyAction(a);
            if (!task) {
              results.push({
                index: i,
                op: a.op,
                id: a.id,
                status: "skipped",
                error: "missing required field (e.g. text for create / id for update)",
              });
              continue;
            }
            actionsApplied += 1;
            yieldQueue.push({ type: "action", task });
            results.push({ index: i, op: a.op, id: a.id, status: "ok", taskId: (task as { id: string }).id });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[voice.apply] failed", { userId, index: i, action: a, error: message });
            // Hand the model a useful summary instead of the Prisma blob.
            const friendly = /No record was found/i.test(message)
              ? `Task id "${a.id}" not found (was it from a previous turn? re-run query()).`
              : message;
            results.push({ index: i, op: a.op, id: a.id, status: "failed", error: friendly });
          }
        }
        const okCount = results.filter((r) => r.status === "ok").length;
        const failedCount = results.filter((r) => r.status === "failed").length;
        console.info("[voice.apply] done", { userId, ok: okCount, failed: failedCount });
        return { results, okCount, failedCount };
      },
    },
    record: {
      description: "Record the reply, transcript, and (optional) task refs.",
      inputSchema: recordSchema,
    },
  };

  return {
    tools,
    get actionsApplied() {
      return actionsApplied;
    },
  };
}
