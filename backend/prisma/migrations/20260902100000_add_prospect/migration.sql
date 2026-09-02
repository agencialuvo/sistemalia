-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NUEVO', 'CONTACTADO', 'CITADO', 'NO_INTERESADO', 'CONVERTIDO');

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NUEVO',
    "sourceProvider" "SocialChannelProvider" NOT NULL,
    "campaignName" TEXT,
    "adName" TEXT,
    "formAnswers" JSONB,
    "assignedUserId" TEXT,
    "patientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prospect_tenantId_idx" ON "Prospect"("tenantId");

-- CreateIndex
CREATE INDEX "Prospect_tenantId_phone_idx" ON "Prospect"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Prospect_tenantId_status_idx" ON "Prospect"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
