CREATE TABLE "CourseCourseware" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "coursewareId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCourseware_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CourseCourseware" (
    "id",
    "courseId",
    "coursewareId",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    'ccw_' || substr(md5("courseId" || "id"), 1, 20),
    "courseId",
    "id",
    "sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Courseware"
WHERE "deletedAt" IS NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "CourseCourseware_courseId_coursewareId_key"
ON "CourseCourseware"("courseId", "coursewareId");

CREATE INDEX "CourseCourseware_courseId_sortOrder_idx"
ON "CourseCourseware"("courseId", "sortOrder");

CREATE INDEX "CourseCourseware_coursewareId_idx"
ON "CourseCourseware"("coursewareId");

ALTER TABLE "CourseCourseware"
ADD CONSTRAINT "CourseCourseware_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseCourseware"
ADD CONSTRAINT "CourseCourseware_coursewareId_fkey"
FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
