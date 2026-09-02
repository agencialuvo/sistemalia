-- AlterTable: Service — nivel 2 (base) del Esquema de Comisiones Jerárquico
ALTER TABLE "Service" ADD COLUMN     "baseCommissionType" "CommissionType",
ADD COLUMN     "baseCommissionValue" DECIMAL(10,2);

-- AlterTable: StaffMember — nivel 3 (default) del Esquema de Comisiones Jerárquico
ALTER TABLE "StaffMember" ADD COLUMN     "defaultCommissionType" "CommissionType",
ADD COLUMN     "defaultCommissionValue" DECIMAL(10,2);

-- AlterTable: StaffService — nivel 1 (custom), renombrado desde commissionType/commissionValue
-- (0 filas con valor no nulo en producción/dev al momento de esta migración; RENAME COLUMN
-- usado de todas formas para no depender de eso).
ALTER TABLE "StaffService" RENAME COLUMN "commissionType" TO "customCommissionType";
ALTER TABLE "StaffService" RENAME COLUMN "commissionValue" TO "customCommissionValue";
