-- CreateEnum
CREATE TYPE "FitzpatrickSkinType" AS ENUM ('TYPE_I', 'TYPE_II', 'TYPE_III', 'TYPE_IV', 'TYPE_V', 'TYPE_VI');

-- AlterTable
ALTER TABLE "PatientMedicalHistory" ADD COLUMN     "activeHerpesBreakout" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fitzpatrickSkinType" "FitzpatrickSkinType",
ADD COLUMN     "frequentSunExposure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPregnantOrLactating" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keloidTendency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roaccutaneLast12Months" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "skinType" TEXT,
ADD COLUMN     "smokingHabits" TEXT;

-- CreateTable
CREATE TABLE "ClinicalFormTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fieldsSchema" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalProcedureRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "staffId" TEXT,
    "formDataValues" JSONB NOT NULL,
    "faceMappingData" JSONB,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalProcedureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalFormTemplate_tenantId_isActive_idx" ON "ClinicalFormTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ClinicalProcedureRecord_patientId_performedAt_idx" ON "ClinicalProcedureRecord"("patientId", "performedAt");

-- CreateIndex
CREATE INDEX "ClinicalProcedureRecord_templateId_idx" ON "ClinicalProcedureRecord"("templateId");

-- CreateIndex
CREATE INDEX "ClinicalProcedureRecord_staffId_idx" ON "ClinicalProcedureRecord"("staffId");

-- AddForeignKey
ALTER TABLE "ClinicalFormTemplate" ADD CONSTRAINT "ClinicalFormTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedureRecord" ADD CONSTRAINT "ClinicalProcedureRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedureRecord" ADD CONSTRAINT "ClinicalProcedureRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClinicalFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalProcedureRecord" ADD CONSTRAINT "ClinicalProcedureRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

