-- CreateEnum
CREATE TYPE "AcquisitionChannel" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'GOOGLE', 'REFERRAL', 'TIKTOK', 'OTHER');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "address" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "acquisitionChannel" "AcquisitionChannel";
