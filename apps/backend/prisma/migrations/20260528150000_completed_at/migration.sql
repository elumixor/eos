-- Add a completion timestamp distinct from updatedAt (which doubles as the
-- sync conflict cursor and so bumps on every edit). Backfill existing
-- completed rows to updatedAt — imperfect for the migration-bumped batch
-- but the best signal available; future completions stamp on transition.

ALTER TABLE "Task" ADD COLUMN "completedAt" DATETIME;
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "completed" = 1;
