-- Payment method choice for jobs: PREPAID (default, current flow) vs COD (cash on
-- delivery — driver collects cash from the customer and transfers the commission to
-- the platform up-front as a "fee"; an admin approves the slip to unlock pickup).

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PREPAID', 'COD');

-- AlterTable: Job — payment method + COD commission gating fields
ALTER TABLE "Job" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PREPAID';
ALTER TABLE "Job" ADD COLUMN "codCommissionFee" INTEGER;
ALTER TABLE "Job" ADD COLUMN "codCommissionSlipUrl" TEXT;
ALTER TABLE "Job" ADD COLUMN "codCommissionSlipUploadedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "codCommissionApprovedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "codCommissionApprovedById" TEXT;
ALTER TABLE "Job" ADD COLUMN "codCommissionRejectedReason" TEXT;
ALTER TABLE "Job" ADD COLUMN "codCommissionRejectedCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Transaction — snapshot the payment method (COD rows are excluded from payouts)
ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PREPAID';
