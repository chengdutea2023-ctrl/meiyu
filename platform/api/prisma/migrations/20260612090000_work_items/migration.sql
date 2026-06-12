-- CreateEnum
CREATE TYPE "WorkItemAudience" AS ENUM ('ADMIN', 'TEACHER');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('STUDENT_REGISTERED', 'TEACHER_PENDING_APPROVAL', 'LEARNING_RECORD_COMPLETED', 'COURSEWARE_DEPLOYMENT_FAILED');

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "type" "WorkItemType" NOT NULL,
    "audience" "WorkItemAudience" NOT NULL,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'PENDING',
    "recipientUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionLabel" TEXT,
    "sourceUserId" TEXT,
    "courseId" TEXT,
    "coursewareId" TEXT,
    "assignmentId" TEXT,
    "learningRecordId" TEXT,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_uniqueKey_key" ON "WorkItem"("uniqueKey");

-- CreateIndex
CREATE INDEX "WorkItem_audience_status_idx" ON "WorkItem"("audience", "status");

-- CreateIndex
CREATE INDEX "WorkItem_recipientUserId_status_idx" ON "WorkItem"("recipientUserId", "status");

-- CreateIndex
CREATE INDEX "WorkItem_type_status_idx" ON "WorkItem"("type", "status");

-- CreateIndex
CREATE INDEX "WorkItem_sourceUserId_idx" ON "WorkItem"("sourceUserId");

-- CreateIndex
CREATE INDEX "WorkItem_courseId_idx" ON "WorkItem"("courseId");

-- CreateIndex
CREATE INDEX "WorkItem_coursewareId_idx" ON "WorkItem"("coursewareId");

-- CreateIndex
CREATE INDEX "WorkItem_assignmentId_idx" ON "WorkItem"("assignmentId");

-- CreateIndex
CREATE INDEX "WorkItem_learningRecordId_idx" ON "WorkItem"("learningRecordId");

-- CreateIndex
CREATE INDEX "WorkItem_completedByUserId_idx" ON "WorkItem"("completedByUserId");

-- CreateIndex
CREATE INDEX "WorkItem_createdAt_idx" ON "WorkItem"("createdAt");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_learningRecordId_fkey" FOREIGN KEY ("learningRecordId") REFERENCES "LearningRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
