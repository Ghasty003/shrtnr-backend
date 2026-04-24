-- CreateEnum
CREATE TYPE "UrlStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "Click" ADD COLUMN     "device" TEXT;

-- AlterTable
ALTER TABLE "Url" ADD COLUMN     "expires_at" TIMESTAMPTZ,
ADD COLUMN     "status" "UrlStatus" NOT NULL DEFAULT 'ACTIVE';
