-- Vehicle photos captured during driver self-signup: 4 angles + the licence plate.
-- All nullable so existing drivers (and progressive form completion) are unaffected.

-- AlterTable: Driver — vehicle photo URLs
ALTER TABLE "Driver" ADD COLUMN     "vehiclePhotoFront" TEXT;
ALTER TABLE "Driver" ADD COLUMN     "vehiclePhotoBack" TEXT;
ALTER TABLE "Driver" ADD COLUMN     "vehiclePhotoLeft" TEXT;
ALTER TABLE "Driver" ADD COLUMN     "vehiclePhotoRight" TEXT;
ALTER TABLE "Driver" ADD COLUMN     "vehiclePhotoPlate" TEXT;
