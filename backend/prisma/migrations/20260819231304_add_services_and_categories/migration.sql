-- CreateEnum
CREATE TYPE "ServiceStructureType" AS ENUM ('SINGLE', 'SESSIONS');

-- CreateEnum
CREATE TYPE "ServiceAvailabilityType" AS ENUM ('GENERAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ServicePaymentMethod" AS ENUM ('IN_PERSON', 'ONLINE', 'DEPOSIT');

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commercialDescription" TEXT NOT NULL,
    "mainImageUrl" TEXT,
    "testimonioGallery" TEXT[],
    "structureType" "ServiceStructureType" NOT NULL DEFAULT 'SINGLE',
    "sessionCount" INTEGER,
    "frequencyDays" INTEGER,
    "singlePrice" DECIMAL(10,2) NOT NULL,
    "packagePrice" DECIMAL(10,2),
    "requiresEvaluation" BOOLEAN NOT NULL DEFAULT false,
    "evaluationServiceId" TEXT,
    "evaluationCost" DECIMAL(10,2),
    "isEvaluationDeductible" BOOLEAN NOT NULL DEFAULT false,
    "deductibleExpirationDays" INTEGER,
    "availabilityType" "ServiceAvailabilityType" NOT NULL DEFAULT 'GENERAL',
    "customSchedule" JSONB,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "contraindications" TEXT[],
    "prePostCare" TEXT,
    "paymentMethod" "ServicePaymentMethod" NOT NULL DEFAULT 'IN_PERSON',
    "depositAmount" DECIMAL(10,2),
    "depositIsPercentage" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCategory_tenantId_idx" ON "ServiceCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_tenantId_name_key" ON "ServiceCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Service_tenantId_isActive_idx" ON "Service"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "Service_evaluationServiceId_idx" ON "Service"("evaluationServiceId");

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_evaluationServiceId_fkey" FOREIGN KEY ("evaluationServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
