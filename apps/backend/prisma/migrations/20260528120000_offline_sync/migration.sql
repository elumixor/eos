-- Add updatedAt + deletedAt to Section and Project (for delta sync + soft delete).
-- SQLite cannot ALTER COLUMN, so rebuild the tables. Task already has updatedAt,
-- so it only needs deletedAt added.

PRAGMA foreign_keys=OFF;

-- Section
CREATE TABLE "new_Section" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rangeKind" TEXT NOT NULL,
  "unit" TEXT,
  "count" INTEGER,
  "offset" INTEGER NOT NULL DEFAULT 0,
  "startDate" TEXT,
  "endDate" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "collapsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  CONSTRAINT "Section_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Section" ("id","userId","name","rangeKind","unit","count","offset","startDate","endDate","order","collapsed","createdAt","updatedAt")
SELECT "id","userId","name","rangeKind","unit","count","offset","startDate","endDate","order","collapsed","createdAt","createdAt" FROM "Section";
DROP TABLE "Section";
ALTER TABLE "new_Section" RENAME TO "Section";
CREATE INDEX "Section_userId_idx" ON "Section"("userId");
CREATE INDEX "Section_userId_updatedAt_idx" ON "Section"("userId", "updatedAt");

-- Project
CREATE TABLE "new_Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatarType" TEXT NOT NULL DEFAULT 'auto',
  "emoji" TEXT,
  "image" TEXT,
  "hue" INTEGER,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "capitalization" TEXT NOT NULL DEFAULT 'sentence',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("id","userId","name","avatarType","emoji","image","hue","hidden","capitalization","order","createdAt","updatedAt")
SELECT "id","userId","name","avatarType","emoji","image","hue","hidden","capitalization","order","createdAt","createdAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_userId_name_key" ON "Project"("userId", "name");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- Task: just add deletedAt and the sync index.
ALTER TABLE "Task" ADD COLUMN "deletedAt" DATETIME;
CREATE INDEX "Task_userId_updatedAt_idx" ON "Task"("userId", "updatedAt");

PRAGMA foreign_keys=ON;
