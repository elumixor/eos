-- AlterTable
ALTER TABLE "Project" ADD COLUMN "parentId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL;
