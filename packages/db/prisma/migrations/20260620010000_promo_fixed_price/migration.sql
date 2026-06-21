-- Promo "lock price" type: a code that fixes the job total to a set THB amount
-- (value = the locked total), overriding the distance-based quote at job creation.

-- AlterEnum
ALTER TYPE "PromoType" ADD VALUE 'FIXED_PRICE';
