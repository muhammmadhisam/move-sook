-- Max concurrent in-hand jobs a driver of this vehicle type may hold, configurable per type.
-- null = fall back to the global `max_active_jobs_per_driver` AppSetting (default 3).

-- AlterTable: VehiclePricing — per-type concurrency cap
ALTER TABLE "VehiclePricing" ADD COLUMN "maxActiveJobs" INTEGER;
