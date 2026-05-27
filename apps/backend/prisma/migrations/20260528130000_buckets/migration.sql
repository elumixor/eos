-- Replace per-day scheduling with a fixed 3-bucket model.
--   Task.date (YYYY-MM-DD | null)  →  Task.bucket ("today" | "week" | "later")
--                                  +  Task.scheduledAt (DateTime | null)
-- "overdue" is derived at display time, never stored.
--
-- Mapping rule (all interpreted as local-day, week starts Monday):
--   date == today                → bucket="today", scheduledAt=today 00:00
--   date in current week (Mon-Sun, excluding today)
--                                → bucket="week",  scheduledAt=that date 00:00
--   anything else (past, future, null)
--                                → bucket="later", scheduledAt=NULL
-- Past-dated incomplete tasks naturally surface in Overdue after migration
-- because their scheduledAt is set when re-dragged; until then they sit in
-- "later". This is intentional — the rollover-on-load logic on the client
-- handles surfacing them once the user touches them.
--
-- The Section table is dropped entirely: sections are now hard-coded.

PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "Section_userId_idx";
DROP INDEX IF EXISTS "Section_userId_updatedAt_idx";
DROP TABLE IF EXISTS "Section";

CREATE TABLE "new_Task" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "bucket" TEXT NOT NULL DEFAULT 'later',
  "scheduledAt" DATETIME,
  "projectId" TEXT,
  "startTime" DATETIME,
  "duration" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Compute "today" (UTC) and Monday of the current week as YYYY-MM-DD.
-- SQLite's date() with 'weekday 0' returns the next Sunday, so subtracting 6
-- days lands on the Monday that started this week.
INSERT INTO "new_Task"
  ("id","userId","text","completed","order","bucket","scheduledAt",
   "projectId","startTime","duration","createdAt","updatedAt","deletedAt")
SELECT
  "id","userId","text","completed","order",
  CASE
    WHEN "date" = date('now')                          THEN 'today'
    WHEN "date" IS NOT NULL
      AND "date" >= date('now','weekday 0','-6 days')
      AND "date" <= date('now','weekday 0')            THEN 'week'
    ELSE 'later'
  END AS "bucket",
  CASE
    WHEN "date" = date('now')                          THEN datetime("date" || ' 00:00:00')
    WHEN "date" IS NOT NULL
      AND "date" >= date('now','weekday 0','-6 days')
      AND "date" <= date('now','weekday 0')            THEN datetime("date" || ' 00:00:00')
    ELSE NULL
  END AS "scheduledAt",
  "projectId","startTime","duration","createdAt","updatedAt","deletedAt"
FROM "Task";

DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
CREATE INDEX "Task_userId_updatedAt_idx" ON "Task"("userId","updatedAt");

PRAGMA foreign_keys=ON;
