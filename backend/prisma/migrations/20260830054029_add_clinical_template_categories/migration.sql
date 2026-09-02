-- CreateTable
CREATE TABLE "ClinicalTemplateCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalTemplateCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalTemplateCategory_tenantId_idx" ON "ClinicalTemplateCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalTemplateCategory_tenantId_name_key" ON "ClinicalTemplateCategory"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "ClinicalTemplateCategory" ADD CONSTRAINT "ClinicalTemplateCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
