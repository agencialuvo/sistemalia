-- A service can now accept several payment methods at once (ej. "en caja" y
-- "anticipo" a la vez), not just one. The old scalar column becomes an array,
-- preserving every existing service's single choice as its first (only)
-- element instead of losing it.
ALTER TABLE "Service" ADD COLUMN "paymentMethods" "ServicePaymentMethod"[] NOT NULL DEFAULT ARRAY['IN_PERSON']::"ServicePaymentMethod"[];

UPDATE "Service" SET "paymentMethods" = ARRAY["paymentMethod"]::"ServicePaymentMethod"[];

ALTER TABLE "Service" DROP COLUMN "paymentMethod";
