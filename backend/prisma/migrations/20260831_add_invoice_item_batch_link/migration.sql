-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceItem_batchId_idx" ON "InvoiceItem"("batchId");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

