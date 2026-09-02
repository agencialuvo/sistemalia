-- CreateEnum
CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_tenantId_isActive_idx" ON "Room"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Room_tenantId_name_key" ON "Room"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Equipment_tenantId_isActive_idx" ON "Equipment"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_tenantId_name_key" ON "Equipment"("tenantId", "name");

-- AlterTable
ALTER TABLE "Appointment"
ADD COLUMN "roomId" TEXT,
ADD COLUMN "equipmentId" TEXT,
ADD COLUMN "paymentStatus" "AppointmentPaymentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Appointment_tenantId_roomId_startAt_idx" ON "Appointment"("tenantId", "roomId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_equipmentId_startAt_idx" ON "Appointment"("tenantId", "equipmentId", "startAt");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
