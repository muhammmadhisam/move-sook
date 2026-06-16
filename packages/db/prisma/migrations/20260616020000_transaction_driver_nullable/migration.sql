-- COD commission is collected from the customer up-front (before any driver claims
-- the job), so its ledger row has no driver. Make Transaction.driverId nullable.

-- DropForeignKey (recreated as optional below)
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_driverId_fkey";

-- AlterColumn
ALTER TABLE "Transaction" ALTER COLUMN "driverId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
