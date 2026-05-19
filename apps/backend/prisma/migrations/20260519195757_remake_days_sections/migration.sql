-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rangeKind" TEXT NOT NULL,
    "unit" TEXT,
    "count" INTEGER,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "endDate" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables: Task drops dayId/thisWeek, gains date.
-- Backfill date from the task's former Day (run while Day still exists).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT,
    "projectId" TEXT,
    "startTime" DATETIME,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("completed", "createdAt", "duration", "id", "order", "projectId", "startTime", "text", "updatedAt", "date")
SELECT "completed", "createdAt", "duration", "id", "order", "projectId", "startTime", "text", "updatedAt",
       (SELECT "date" FROM "Day" WHERE "Day"."id" = "Task"."dayId")
FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- DropTable: Day is no longer referenced.
DROP INDEX "Day_date_key";
PRAGMA foreign_keys=off;
DROP TABLE "Day";
PRAGMA foreign_keys=on;
