-- Per-user guided-tour (onboarding) completion tracking. A row means the user has
-- learned (completed or skipped) that tour at the given version; absence means
-- "not yet learned" — the UI highlights the help button and auto-runs the tour.

-- CreateTable
CREATE TABLE "TourSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourSeen_userId_idx" ON "TourSeen"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TourSeen_userId_tourId_key" ON "TourSeen"("userId", "tourId");

-- AddForeignKey
ALTER TABLE "TourSeen" ADD CONSTRAINT "TourSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
