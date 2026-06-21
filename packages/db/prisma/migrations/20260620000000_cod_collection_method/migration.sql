-- COD payment collection: for a COD job the driver records HOW they received the cash
-- remainder from the customer at the destination, BEFORE marking the delivery done.
-- TRANSFER requires a proof slip (codCollectionSlipUrl).

-- CreateEnum
CREATE TYPE "CodCollectionMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterTable: Job — driver-recorded COD collection
ALTER TABLE "Job" ADD COLUMN "codCollectionMethod" "CodCollectionMethod";
ALTER TABLE "Job" ADD COLUMN "codCollectionSlipUrl" TEXT;
ALTER TABLE "Job" ADD COLUMN "codCollectedAt" TIMESTAMP(3);
