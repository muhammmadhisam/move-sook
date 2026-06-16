-- CreateEnum
CREATE TYPE "AddrChangeStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'PENDING_REVIEW', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "destChangeApprovedById" TEXT,
ADD COLUMN     "destChangeCompletedAt" TIMESTAMP(3),
ADD COLUMN     "destChangeExtraKm" DOUBLE PRECISION,
ADD COLUMN     "destChangeFee" INTEGER,
ADD COLUMN     "destChangeNewAddress" TEXT,
ADD COLUMN     "destChangeNewLat" DOUBLE PRECISION,
ADD COLUMN     "destChangeNewLng" DOUBLE PRECISION,
ADD COLUMN     "destChangeNewProvince" TEXT,
ADD COLUMN     "destChangeReason" TEXT,
ADD COLUMN     "destChangeRejectedReason" TEXT,
ADD COLUMN     "destChangeRequestedAt" TIMESTAMP(3),
ADD COLUMN     "destChangeSlipUploadedAt" TIMESTAMP(3),
ADD COLUMN     "destChangeSlipUrl" TEXT,
ADD COLUMN     "destChangeStatus" "AddrChangeStatus" NOT NULL DEFAULT 'NONE';
