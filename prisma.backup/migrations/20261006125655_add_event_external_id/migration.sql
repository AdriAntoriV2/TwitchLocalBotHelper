/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `StreamEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StreamEvent" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StreamEvent_externalId_key" ON "StreamEvent"("externalId");
