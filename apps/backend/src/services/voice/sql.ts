// Read-only SQL guard. query() wraps user-supplied SQL in a CTE named
// `tasks` that resolves to the current user's alive rows. The model is told
// to SELECT FROM `tasks`, never from `Task`. Writes / pragmas / refs to the
// real Task table are rejected outright.
const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|attach|detach|pragma|create|replace|truncate)\b/i;
// Guard against the model bypassing tenant scoping by going straight to the
// real Task table (any quoting / case combination).
const RAW_TASK_REF = /\b(?:from|join)\s+("|`|\[)?task\1?\b/i;

export function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return false;
  if (trimmed.includes(";")) return false;
  if (FORBIDDEN_SQL.test(trimmed)) return false;
  if (RAW_TASK_REF.test(trimmed)) return false;
  return /^\s*(select|with)\b/i.test(trimmed);
}

// SQLite returns COUNT()/SUM() as BigInt and DATETIME columns as Date —
// neither survives JSON.stringify. Recursively normalise.
export function normaliseValue(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normaliseValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = normaliseValue(val);
    return out;
  }
  return v;
}

export const normaliseRows = (rows: unknown[]): unknown[] => rows.map(normaliseValue);

// Build the read-only CTE that scopes user-supplied SQL to the current user's
// alive rows and adds the precomputed flags / local-tz date columns the
// model relies on to match what the UI shows.
export function buildScopedQuery(
  userSqlRaw: string,
  args: { userId: string; localShift: string; clientDate: string },
): string {
  const escapedUserId = args.userId.replace(/'/g, "''");
  const userSql = userSqlRaw.trim().replace(/;+\s*$/, "");
  const hasLimit = /\blimit\b/i.test(userSql);
  const { localShift, clientDate } = args;
  return (
    `WITH tasks AS (` +
    `SELECT *, ` +
    `CASE WHEN scheduledAt IS NULL THEN NULL ` +
    `  ELSE DATE(datetime(scheduledAt, '${localShift}')) END AS scheduledDate, ` +
    `CASE WHEN completedAt IS NULL THEN NULL ` +
    `  ELSE DATE(datetime(completedAt, '${localShift}')) END AS completedDate, ` +
    `CASE WHEN bucket IN ('today','week') AND scheduledAt IS NOT NULL ` +
    `  AND DATE(datetime(scheduledAt, '${localShift}')) < DATE('${clientDate}') ` +
    `  AND completed = 0 THEN 1 ELSE 0 END AS isOverdue, ` +
    `CASE WHEN completed = 1 AND ( ` +
    `  bucket = 'later' OR ( ` +
    `    bucket IN ('today','week') AND scheduledAt IS NOT NULL ` +
    `    AND DATE(datetime(scheduledAt, '${localShift}')) < DATE('${clientDate}') ` +
    `  ) ` +
    `) THEN 1 ELSE 0 END AS isArchived ` +
    `FROM "Task" WHERE "userId" = '${escapedUserId}' AND "deletedAt" IS NULL` +
    `) ${userSql}${hasLimit ? "" : " LIMIT 100"}`
  );
}
