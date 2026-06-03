ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Course" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Courseware" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "Course_deletedAt_idx" ON "Course"("deletedAt");
CREATE INDEX "Courseware_deletedAt_idx" ON "Courseware"("deletedAt");
CREATE INDEX "Courseware_courseId_deletedAt_idx" ON "Courseware"("courseId", "deletedAt");
