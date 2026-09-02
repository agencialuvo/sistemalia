-- CreateTable
CREATE TABLE "PatientTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientTag_tenantId_idx" ON "PatientTag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientTag_tenantId_name_key" ON "PatientTag"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "PatientTag" ADD CONSTRAINT "PatientTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
