-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "googleChildEventId" TEXT,
ADD COLUMN     "googleParentEventId" TEXT;

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "googleCalendarChildId" TEXT,
ADD COLUMN     "googleEmail" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "googleAccessToken" TEXT,
ADD COLUMN     "googleCalendarParentId" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "googleSyncEnabled" BOOLEAN NOT NULL DEFAULT false;

