-- CreateEnum
CREATE TYPE "CoursewareTeachingStatus" AS ENUM ('CLOSED', 'OPEN');

-- CreateTable
CREATE TABLE "CourseAssignmentCoursewareState" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "coursewareId" TEXT NOT NULL,
    "status" "CoursewareTeachingStatus" NOT NULL DEFAULT 'CLOSED',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAssignmentCoursewareState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignmentCoursewareState_assignmentId_coursewareId_key" ON "CourseAssignmentCoursewareState"("assignmentId", "coursewareId");

-- CreateIndex
CREATE INDEX "CourseAssignmentCoursewareState_assignmentId_idx" ON "CourseAssignmentCoursewareState"("assignmentId");

-- CreateIndex
CREATE INDEX "CourseAssignmentCoursewareState_coursewareId_idx" ON "CourseAssignmentCoursewareState"("coursewareId");

-- CreateIndex
CREATE INDEX "CourseAssignmentCoursewareState_status_idx" ON "CourseAssignmentCoursewareState"("status");

-- AddForeignKey
ALTER TABLE "CourseAssignmentCoursewareState" ADD CONSTRAINT "CourseAssignmentCoursewareState_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentCoursewareState" ADD CONSTRAINT "CourseAssignmentCoursewareState_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;
