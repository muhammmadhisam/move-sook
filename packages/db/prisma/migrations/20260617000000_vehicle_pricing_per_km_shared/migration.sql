-- Non-charter (PER_ITEM / ไม่เหมาลำ) per-km rate, configurable per vehicle type.
-- null = fall back to the global `price_per_km_shared` AppSetting (itself defaulting
-- to a rate cheaper than the charter `price_per_km`).

-- AlterTable: VehiclePricing — per-type non-charter per-km rate
ALTER TABLE "VehiclePricing" ADD COLUMN "pricePerKmShared" INTEGER;
