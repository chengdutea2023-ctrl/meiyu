CREATE TYPE "CourseRuntimeType" AS ENUM ('STATIC', 'NODE', 'BOTH');
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CourseOwnerType" AS ENUM ('ADMIN', 'TEACHER', 'DEVELOPER');
CREATE TYPE "CourseAssignmentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "LearningRecordStatus" AS ENUM ('STARTED', 'PROGRESS', 'COMPLETED');

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "runtimeType" "CourseRuntimeType" NOT NULL DEFAULT 'STATIC',
    "entryUrl" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerType" "CourseOwnerType" NOT NULL DEFAULT 'ADMIN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "status" "CourseAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningRecord" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "classId" TEXT,
    "studentId" TEXT NOT NULL,
    "status" "LearningRecordStatus" NOT NULL DEFAULT 'STARTED',
    "score" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
CREATE INDEX "Course_status_idx" ON "Course"("status");
CREATE INDEX "Course_ownerType_idx" ON "Course"("ownerType");
CREATE INDEX "Course_createdByUserId_idx" ON "Course"("createdByUserId");

CREATE INDEX "CourseAssignment_courseId_idx" ON "CourseAssignment"("courseId");
CREATE INDEX "CourseAssignment_classId_idx" ON "CourseAssignment"("classId");
CREATE INDEX "CourseAssignment_teacherId_idx" ON "CourseAssignment"("teacherId");
CREATE INDEX "CourseAssignment_status_idx" ON "CourseAssignment"("status");

CREATE INDEX "LearningRecord_courseId_idx" ON "LearningRecord"("courseId");
CREATE INDEX "LearningRecord_assignmentId_idx" ON "LearningRecord"("assignmentId");
CREATE INDEX "LearningRecord_classId_idx" ON "LearningRecord"("classId");
CREATE INDEX "LearningRecord_studentId_idx" ON "LearningRecord"("studentId");
CREATE INDEX "LearningRecord_status_idx" ON "LearningRecord"("status");

ALTER TABLE "Course" ADD CONSTRAINT "Course_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
