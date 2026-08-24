-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "frequencyDays" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePackage_serviceId_idx" ON "ServicePackage"("serviceId");

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: preserve each existing single-package service (sessionCount/
-- frequencyDays/packagePrice) as its first row in ServicePackage before the
-- old scalar columns are dropped below. Only services that actually had a
-- package (sessionCount IS NOT NULL) get a row.
INSERT INTO "ServicePackage" ("id", "serviceId", "sessionCount", "frequencyDays", "price", "createdAt")
SELECT gen_random_uuid(), "id", "sessionCount", "frequencyDays", "packagePrice", CURRENT_TIMESTAMP
FROM "Service"
WHERE "sessionCount" IS NOT NULL AND "packagePrice" IS NOT NULL;

-- AlterTable: sessionCount/frequencyDays/packagePrice replaced by the
-- ServicePackage relation (a SESSIONS service can now offer several packages
-- at once, e.g. "3 sesiones" and "6 sesiones" of the same tratamiento).
ALTER TABLE "Service" DROP COLUMN "frequencyDays",
DROP COLUMN "packagePrice",
DROP COLUMN "sessionCount";
