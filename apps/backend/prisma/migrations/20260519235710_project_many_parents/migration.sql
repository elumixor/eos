-- CreateTable
CREATE TABLE "ProjectParent" (
    "childId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    PRIMARY KEY ("childId", "parentId"),
    CONSTRAINT "ProjectParent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "ProjectParent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "ProjectParent_parentId_idx" ON "ProjectParent"("parentId");

-- Copy existing single-parent links into the join table
INSERT INTO "ProjectParent" ("childId", "parentId")
  SELECT "id", "parentId" FROM "Project" WHERE "parentId" IS NOT NULL;

-- RedefineTables (SQLite-safe drop of the legacy `parentId` column)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatarType" TEXT NOT NULL DEFAULT 'auto',
    "emoji" TEXT,
    "image" TEXT,
    "hue" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Project" ("id", "name", "avatarType", "emoji", "image", "hue", "createdAt")
  SELECT "id", "name", "avatarType", "emoji", "image", "hue", "createdAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");
PRAGMA foreign_keys=ON;
