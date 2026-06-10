-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "cancellationFeeApplied" INTEGER,
ADD COLUMN     "paymentRejectedCount" INTEGER NOT NULL DEFAULT 0;
