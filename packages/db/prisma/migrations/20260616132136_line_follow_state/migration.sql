-- AlterTable: track LINE OA follow state on User (set by webhook follow/unfollow)
-- IF NOT EXISTS so the migration is idempotent — some envs already have these
-- columns (added out-of-band); on a fresh DB it adds them normally.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineFollowing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lineFollowedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lineUnfollowedAt" TIMESTAMP(3);
