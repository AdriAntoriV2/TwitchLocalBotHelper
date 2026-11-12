-- CreateTable
CREATE TABLE "PointPoolGoal" (
    "id" TEXT NOT NULL,
    "targetPoints" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,

    CONSTRAINT "PointPoolGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointPoolAdjustment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "attribution" TEXT NOT NULL DEFAULT 'GreedyKAITO',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,

    CONSTRAINT "PointPoolAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointPoolGoal_pointPoolEventId_createdAt_idx" ON "PointPoolGoal"("pointPoolEventId", "createdAt");

-- CreateIndex
CREATE INDEX "PointPoolAdjustment_pointPoolEventId_createdAt_idx" ON "PointPoolAdjustment"("pointPoolEventId", "createdAt");

-- AddForeignKey
ALTER TABLE "PointPoolGoal" ADD CONSTRAINT "PointPoolGoal_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointPoolAdjustment" ADD CONSTRAINT "PointPoolAdjustment_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
