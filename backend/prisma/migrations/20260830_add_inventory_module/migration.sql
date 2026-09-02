-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CONSUMABLE', 'RETAIL', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_INPUT', 'CLINICAL_CONSUMPTION', 'RETAIL_SALE', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 'EXPIRED_DISCARD');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "minStock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(10,2) NOT NULL,
    "salePrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "initialQuantity" DECIMAL(10,2) NOT NULL,
    "currentQuantity" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "costUnitPrice" DECIMAL(10,2),
    "referenceId" TEXT,
    "notes" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Product_tenantId_type_idx" ON "Product"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_productId_isActive_expirationDate_idx" ON "InventoryBatch"("tenantId", "productId", "isActive", "expirationDate");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_expirationDate_idx" ON "InventoryBatch"("tenantId", "expirationDate");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_createdAt_idx" ON "StockMovement"("tenantId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

