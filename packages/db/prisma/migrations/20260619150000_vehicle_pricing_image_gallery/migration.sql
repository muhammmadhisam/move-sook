-- Multiple example photos per vehicle type (gallery), shown to customers in
-- addition to the single cover `imageUrl`. Defaults to empty so existing rows
-- are unaffected.

-- AlterTable: VehiclePricing — example-photo gallery
ALTER TABLE "VehiclePricing" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
