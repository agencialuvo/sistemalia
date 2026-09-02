-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- AlterTable
ALTER TABLE "StaffService" ADD COLUMN     "commissionType" "CommissionType",
ADD COLUMN     "commissionValue" DECIMAL(10,2);

