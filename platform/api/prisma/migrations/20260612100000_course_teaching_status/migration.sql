-- CreateEnum
CREATE TYPE "CourseTeachingStatus" AS ENUM ('READY', 'OPEN', 'ENDED');

-- AlterTable
ALTER TABLE "CourseAssignment"
ADD COLUMN "teachingStatus" "CourseTeachingStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "openedByUserId" TEXT,
ADD COLUMN "closedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "CourseAssignment_teachingStatus_idx" ON "CourseAssignment"("teachingStatus");
