-- Vehicle types become an admin-managed catalog (VehiclePricing rows) instead of a
-- fixed enum. Convert the enum-typed columns to TEXT, preserving every existing value
-- verbatim (MOTORCYCLE / PICKUP / TRUCK_4W / TRUCK_6W stay as plain strings), then drop
-- the now-unused enum type.

ALTER TABLE "Driver" ALTER COLUMN "vehicleType" TYPE TEXT USING "vehicleType"::text;
ALTER TABLE "Job" ALTER COLUMN "vehicleType" TYPE TEXT USING "vehicleType"::text;
ALTER TABLE "VehiclePricing" ALTER COLUMN "vehicleType" TYPE TEXT USING "vehicleType"::text;

DROP TYPE "VehicleType";
