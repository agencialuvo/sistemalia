-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'YAPE', 'PLIN', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('BOLETA', 'FACTURA', 'SALE_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PAID', 'ANULLED');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('INITIAL_BALANCE', 'INCOME_SALE', 'MANUAL_INCOME', 'EXPENSE_OUT', 'COMMISSION_PAYMENT');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "initialBalance" DECIMAL(10,2) NOT NULL,
    "finalBalance" DECIMAL(10,2),
    "expectedBalance" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSeriesCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "series" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSeriesCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "cashRegisterId" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "customerDocType" TEXT,
    "customerDocNumber" TEXT,
    "customerName" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulledAt" TIMESTAMP(3),
    "anulledReason" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "serviceId" TEXT,
    "productId" TEXT,
    "staffId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2),

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "concept" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_status_idx" ON "CashRegister"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CashRegister_tenantId_openedAt_idx" ON "CashRegister"("tenantId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSeriesCounter_tenantId_type_series_key" ON "InvoiceSeriesCounter"("tenantId", "type", "series");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_appointmentId_idx" ON "Invoice"("appointmentId");

-- CreateIndex
CREATE INDEX "Invoice_cashRegisterId_idx" ON "Invoice"("cashRegisterId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_type_series_number_key" ON "Invoice"("tenantId", "type", "series", "number");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_serviceId_idx" ON "InvoiceItem"("serviceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "InvoiceItem_staffId_idx" ON "InvoiceItem"("staffId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_cashRegisterId_idx" ON "Payment"("cashRegisterId");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_cashRegisterId_createdAt_idx" ON "CashMovement"("tenantId", "cashRegisterId", "createdAt");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceSeriesCounter" ADD CONSTRAINT "InvoiceSeriesCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

