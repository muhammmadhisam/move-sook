-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "lastName" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lineFollowedAt" TIMESTAMP(3),
ADD COLUMN     "lineFollowing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lineUnfollowedAt" TIMESTAMP(3);
