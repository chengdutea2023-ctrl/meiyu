CREATE TYPE "UserType" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
CREATE TYPE "UserApprovalStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "userType" "UserType" NOT NULL DEFAULT 'STUDENT';
ALTER TABLE "User" ADD COLUMN "approvalStatus" "UserApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "User" ADD COLUMN "ageBand" TEXT;

UPDATE "User" SET "userType" = 'ADMIN', "approvalStatus" = 'APPROVED' WHERE "isPlatformAdmin" = true;

CREATE INDEX "User_userType_idx" ON "User"("userType");
CREATE INDEX "User_approvalStatus_idx" ON "User"("approvalStatus");

CREATE TABLE "ApplicationOrganizationAccess" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationOrganizationAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationClassAccess" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationClassAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationOrganizationAccess_applicationId_organizationId_key" ON "ApplicationOrganizationAccess"("applicationId", "organizationId");
CREATE INDEX "ApplicationOrganizationAccess_organizationId_idx" ON "ApplicationOrganizationAccess"("organizationId");

CREATE UNIQUE INDEX "ApplicationClassAccess_applicationId_classId_key" ON "ApplicationClassAccess"("applicationId", "classId");
CREATE INDEX "ApplicationClassAccess_classId_idx" ON "ApplicationClassAccess"("classId");

ALTER TABLE "ApplicationOrganizationAccess" ADD CONSTRAINT "ApplicationOrganizationAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationOrganizationAccess" ADD CONSTRAINT "ApplicationOrganizationAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationClassAccess" ADD CONSTRAINT "ApplicationClassAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationClassAccess" ADD CONSTRAINT "ApplicationClassAccess_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
