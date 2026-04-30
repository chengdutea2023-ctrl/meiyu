-- AlterTable
ALTER TABLE "User" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "sourceApplicationId" TEXT;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ApplicationUser" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstLinkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_sourceApplicationId_idx" ON "User"("sourceApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationUser_applicationId_externalUserId_key" ON "ApplicationUser"("applicationId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationUser_applicationId_email_key" ON "ApplicationUser"("applicationId", "email");

-- CreateIndex
CREATE INDEX "ApplicationUser_userId_idx" ON "ApplicationUser"("userId");

-- CreateIndex
CREATE INDEX "ApplicationUser_email_idx" ON "ApplicationUser"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUser" ADD CONSTRAINT "ApplicationUser_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUser" ADD CONSTRAINT "ApplicationUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
