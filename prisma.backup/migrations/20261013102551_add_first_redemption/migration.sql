-- CreateTable
CREATE TABLE "FirstRedemption" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "twitchRedemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "userDisplayName" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirstRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FirstRedemption_streamId_key" ON "FirstRedemption"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "FirstRedemption_twitchRedemptionId_key" ON "FirstRedemption"("twitchRedemptionId");

-- CreateIndex
CREATE INDEX "FirstRedemption_redeemedAt_idx" ON "FirstRedemption"("redeemedAt");

-- AddForeignKey
ALTER TABLE "FirstRedemption" ADD CONSTRAINT "FirstRedemption_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
