-- CreateTable
CREATE TABLE "PointPoolEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointPoolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointPoolRedemption" (
    "id" TEXT NOT NULL,
    "twitchRedemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "userDisplayName" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardTitle" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,

    CONSTRAINT "PointPoolRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointPoolEvent_status_idx" ON "PointPoolEvent"("status");

-- CreateIndex
CREATE INDEX "PointPoolEvent_createdAt_idx" ON "PointPoolEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointPoolRedemption_twitchRedemptionId_key" ON "PointPoolRedemption"("twitchRedemptionId");

-- CreateIndex
CREATE INDEX "PointPoolRedemption_pointPoolEventId_redeemedAt_idx" ON "PointPoolRedemption"("pointPoolEventId", "redeemedAt");

-- CreateIndex
CREATE INDEX "PointPoolRedemption_userId_idx" ON "PointPoolRedemption"("userId");

-- AddForeignKey
ALTER TABLE "PointPoolRedemption" ADD CONSTRAINT "PointPoolRedemption_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
