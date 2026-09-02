-- AlterTable
ALTER TABLE "ClinicalProcedureRecord" ADD COLUMN     "appointmentId" TEXT;

-- CreateIndex
CREATE INDEX "ClinicalProcedureRecord_appointmentId_idx" ON "ClinicalProcedureRecord"("appointmentId");

-- AddForeignKey
ALTER TABLE "ClinicalProcedureRecord" ADD CONSTRAINT "ClinicalProcedureRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

