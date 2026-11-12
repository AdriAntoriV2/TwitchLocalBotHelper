-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamEvent" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stream_startedAt_idx" ON "Stream"("startedAt");

-- CreateIndex
CREATE INDEX "StreamEvent_streamId_idx" ON "StreamEvent"("streamId");

-- CreateIndex
CREATE INDEX "StreamEvent_type_idx" ON "StreamEvent"("type");

-- CreateIndex
CREATE INDEX "StreamEvent_createdAt_idx" ON "StreamEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "StreamEvent" ADD CONSTRAINT "StreamEvent_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
