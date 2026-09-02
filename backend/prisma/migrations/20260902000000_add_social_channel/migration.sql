-- CreateEnum
CREATE TYPE "SocialChannelProvider" AS ENUM ('META_FACEBOOK', 'META_INSTAGRAM', 'TIKTOK', 'WHATSAPP_OFFICIAL');

-- CreateEnum
CREATE TYPE "SocialChannelStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "SocialChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "SocialChannelProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "SocialChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialChannel_tenantId_idx" ON "SocialChannel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialChannel_tenantId_provider_externalId_key" ON "SocialChannel"("tenantId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "SocialChannel" ADD CONSTRAINT "SocialChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
