-- Add soft-delete columns for organizations and classes.
ALTER TABLE "Organization" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Class" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");
CREATE INDEX "Class_deletedAt_idx" ON "Class"("deletedAt");
