-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('CUSTOM_OFF', 'WORKING_DAY', 'REPETITIVE_OFF');

-- AlterTable
ALTER TABLE "StaffAbsence" ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "type" "ExceptionType" NOT NULL DEFAULT 'CUSTOM_OFF';

-- AlterTable
ALTER TABLE "StaffSchedule" DROP COLUMN "endTime",
DROP COLUMN "lunchEndTime",
DROP COLUMN "lunchStartTime",
DROP COLUMN "startTime";

-- AlterTable
ALTER TABLE "StaffService" ADD COLUMN     "customBufferAfterMin" INTEGER,
ADD COLUMN     "customBufferBeforeMin" INTEGER,
ADD COLUMN     "hideBufferFromClient" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StaffScheduleShift" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StaffScheduleShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffBreak" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "StaffBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffScheduleShift_scheduleId_idx" ON "StaffScheduleShift"("scheduleId");

-- CreateIndex
CREATE INDEX "StaffScheduleShift_serviceId_idx" ON "StaffScheduleShift"("serviceId");

-- CreateIndex
CREATE INDEX "StaffBreak_shiftId_idx" ON "StaffBreak"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSchedule_staffMemberId_dayOfWeek_key" ON "StaffSchedule"("staffMemberId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "StaffScheduleShift" ADD CONSTRAINT "StaffScheduleShift_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "StaffSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffScheduleShift" ADD CONSTRAINT "StaffScheduleShift_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBreak" ADD CONSTRAINT "StaffBreak_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "StaffScheduleShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

