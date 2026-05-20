-- Create User table and the owner row that inherits all existing data.
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT,
  "name" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

INSERT INTO "User" ("id", "email", "name", "createdAt")
VALUES ('user_seed_vladogim97', 'vladogim97@gmail.com', NULL, CURRENT_TIMESTAMP);

-- Rewrite Section with userId pointing at the seed user for existing rows.
PRAGMA foreign_keys=OFF;

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
  CONSTRAINT "Section_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Section" ("id","userId","name","rangeKind","unit","count","offset","startDate","endDate","order","collapsed","createdAt")
SELECT "id",'user_seed_vladogim97',"name","rangeKind","unit","count","offset","startDate","endDate","order","collapsed","createdAt" FROM "Section";
DROP TABLE "Section";
ALTER TABLE "new_Section" RENAME TO "Section";
CREATE INDEX "Section_userId_idx" ON "Section"("userId");

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
  CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("id","userId","name","avatarType","emoji","image","hue","hidden","capitalization","order","createdAt")
SELECT "id",'user_seed_vladogim97',"name","avatarType","emoji","image","hue","hidden","capitalization","order","createdAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_userId_name_key" ON "Project"("userId","name");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

CREATE TABLE "new_Task" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "date" TEXT,
  "projectId" TEXT,
  "startTime" DATETIME,
  "duration" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("id","userId","text","completed","order","date","projectId","startTime","duration","createdAt","updatedAt")
SELECT "id",'user_seed_vladogim97',"text","completed","order","date","projectId","startTime","duration","createdAt","updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

PRAGMA foreign_keys=ON;
