-- AlterEnum
BEGIN;
CREATE TYPE "MediaKind_new" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'PDF');
ALTER TABLE "MediaAsset" ALTER COLUMN "kind" TYPE "MediaKind_new" USING ("kind"::text::"MediaKind_new");
ALTER TYPE "MediaKind" RENAME TO "MediaKind_old";
ALTER TYPE "MediaKind_new" RENAME TO "MediaKind";
DROP TYPE "public"."MediaKind_old";
COMMIT;
