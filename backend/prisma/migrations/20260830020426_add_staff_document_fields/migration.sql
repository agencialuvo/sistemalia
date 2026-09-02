-- CreateEnum
CREATE TYPE "StaffDocumentType" AS ENUM ('DNI', 'CE', 'PASSPORT');

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "documentType" "StaffDocumentType",
ADD COLUMN     "documentNumber" TEXT;
