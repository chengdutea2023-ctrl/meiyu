-- CreateTable
CREATE TABLE "Courseware" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "runtimeType" "CourseRuntimeType" NOT NULL DEFAULT 'STATIC',
    "entryUrl" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "manifest" JSONB,
    "manifestValid" BOOLEAN NOT NULL DEFAULT false,
    "manifestErrors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deploymentStatus" TEXT NOT NULL DEFAULT 'NOT_UPLOADED',
    "deploymentMessage" TEXT,
    "nodePort" INTEGER,
    "uploadedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courseware_pkey" PRIMARY KEY ("id")
);

-- Backfill one default courseware for each existing course so the migration can run before a reset.
INSERT INTO "Courseware" (
    "id",
    "courseId",
    "slug",
    "title",
    "description",
    "sortOrder",
    "runtimeType",
    "entryUrl",
    "status",
    "manifest",
    "manifestValid",
    "manifestErrors",
    "deploymentStatus",
    "deploymentMessage",
    "nodePort",
    "uploadedAt",
    "deployedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'cw_' || substr(md5("id"), 1, 22),
    "id",
    "slug",
    "title",
    "description",
    0,
    "runtimeType",
    "entryUrl",
    "status",
    "manifest",
    "manifestValid",
    "manifestErrors",
    "deploymentStatus",
    "deploymentMessage",
    "nodePort",
    "uploadedAt",
    "deployedAt",
    "createdAt",
    "updatedAt"
FROM "Course";

-- AlterTable
ALTER TABLE "LearningRecord" ADD COLUMN "coursewareId" TEXT;
UPDATE "LearningRecord"
SET "coursewareId" = "Courseware"."id"
FROM "Courseware"
WHERE "LearningRecord"."courseId" = "Courseware"."courseId";
ALTER TABLE "LearningRecord" ALTER COLUMN "coursewareId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CourseLaunchSession" ADD COLUMN "coursewareId" TEXT;
UPDATE "CourseLaunchSession"
SET "coursewareId" = "Courseware"."id"
FROM "Courseware"
WHERE "CourseLaunchSession"."courseId" = "Courseware"."courseId";
ALTER TABLE "CourseLaunchSession" ALTER COLUMN "coursewareId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Courseware_courseId_slug_key" ON "Courseware"("courseId", "slug");

-- CreateIndex
CREATE INDEX "Courseware_courseId_idx" ON "Courseware"("courseId");

-- CreateIndex
CREATE INDEX "Courseware_status_idx" ON "Courseware"("status");

-- CreateIndex
CREATE INDEX "Courseware_sortOrder_idx" ON "Courseware"("sortOrder");

-- CreateIndex
CREATE INDEX "LearningRecord_coursewareId_idx" ON "LearningRecord"("coursewareId");

-- CreateIndex
CREATE INDEX "CourseLaunchSession_coursewareId_idx" ON "CourseLaunchSession"("coursewareId");

-- AddForeignKey
ALTER TABLE "Courseware" ADD CONSTRAINT "Courseware_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLaunchSession" ADD CONSTRAINT "CourseLaunchSession_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;
