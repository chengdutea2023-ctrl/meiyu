-- CreateTable
CREATE TABLE "LearningRecordArtifact" (
    "id" TEXT NOT NULL,
    "learningRecordId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "courseId" TEXT NOT NULL,
    "coursewareId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningRecordArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_learningRecordId_idx" ON "LearningRecordArtifact"("learningRecordId");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_assignmentId_idx" ON "LearningRecordArtifact"("assignmentId");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_courseId_idx" ON "LearningRecordArtifact"("courseId");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_coursewareId_idx" ON "LearningRecordArtifact"("coursewareId");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_studentId_idx" ON "LearningRecordArtifact"("studentId");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_kind_idx" ON "LearningRecordArtifact"("kind");

-- CreateIndex
CREATE INDEX "LearningRecordArtifact_createdAt_idx" ON "LearningRecordArtifact"("createdAt");

-- AddForeignKey
ALTER TABLE "LearningRecordArtifact" ADD CONSTRAINT "LearningRecordArtifact_learningRecordId_fkey" FOREIGN KEY ("learningRecordId") REFERENCES "LearningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecordArtifact" ADD CONSTRAINT "LearningRecordArtifact_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecordArtifact" ADD CONSTRAINT "LearningRecordArtifact_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecordArtifact" ADD CONSTRAINT "LearningRecordArtifact_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecordArtifact" ADD CONSTRAINT "LearningRecordArtifact_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
