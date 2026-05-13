ALTER TABLE "ApplicationUser" ADD COLUMN "ageBand" TEXT;
ALTER TABLE "ApplicationUser" ADD COLUMN "agentName" TEXT;

CREATE INDEX "ApplicationUser_applicationId_agentName_idx" ON "ApplicationUser"("applicationId", "agentName");
