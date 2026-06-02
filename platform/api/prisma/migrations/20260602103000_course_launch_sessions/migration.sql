-- CreateTable
CREATE TABLE "CourseLaunchSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "classId" TEXT,
    "studentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLaunchSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseLaunchSession_tokenHash_key" ON "CourseLaunchSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_courseId_idx" ON "CourseLaunchSession"("courseId");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_assignmentId_idx" ON "CourseLaunchSession"("assignmentId");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_classId_idx" ON "CourseLaunchSession"("classId");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_studentId_idx" ON "CourseLaunchSession"("studentId");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_expiresAt_idx" ON "CourseLaunchSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "CourseLaunchSession" ADD CONSTRAINT "CourseLaunchSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLaunchSession" ADD CONSTRAINT "CourseLaunchSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLaunchSession" ADD CONSTRAINT "CourseLaunchSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLaunchSession" ADD CONSTRAINT "CourseLaunchSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
