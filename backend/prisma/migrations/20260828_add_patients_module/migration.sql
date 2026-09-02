-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PatientDocumentType" AS ENUM ('DNI', 'CE', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "PatientGalleryCategory" AS ENUM ('BEFORE', 'AFTER', 'PROGRESS');

-- CreateEnum
CREATE TYPE "PatientConsentStatus" AS ENUM ('PENDING', 'SIGNED', 'REVOKED');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentType" "PatientDocumentType" NOT NULL DEFAULT 'DNI',
    "documentNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" "Gender",
    "tags" TEXT[],
    "notes" TEXT,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedicalHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "allergies" TEXT[],
    "chronicConditions" TEXT[],
    "currentMedications" TEXT[],
    "bloodType" VARCHAR(5),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientMedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientClinicalNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientGalleryImage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "category" "PatientGalleryCategory" NOT NULL,
    "serviceId" TEXT,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentUrl" TEXT,
    "status" "PatientConsentStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "signatureUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_tenantId_status_idx" ON "Patient"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Patient_tenantId_email_idx" ON "Patient"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_documentNumber_key" ON "Patient"("tenantId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PatientMedicalHistory_patientId_key" ON "PatientMedicalHistory"("patientId");

-- CreateIndex
CREATE INDEX "PatientClinicalNote_patientId_createdAt_idx" ON "PatientClinicalNote"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientGalleryImage_patientId_category_idx" ON "PatientGalleryImage"("patientId", "category");

-- CreateIndex
CREATE INDEX "PatientGalleryImage_serviceId_idx" ON "PatientGalleryImage"("serviceId");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_idx" ON "PatientConsent"("patientId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedicalHistory" ADD CONSTRAINT "PatientMedicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinicalNote" ADD CONSTRAINT "PatientClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientGalleryImage" ADD CONSTRAINT "PatientGalleryImage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientGalleryImage" ADD CONSTRAINT "PatientGalleryImage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

