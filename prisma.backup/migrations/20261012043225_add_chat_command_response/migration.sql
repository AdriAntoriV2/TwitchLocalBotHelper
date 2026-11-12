/*
  Warnings:

  - Added the required column `response` to the `ChatCommand` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChatCommand" ADD COLUMN     "response" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ChatCommand_enabled_idx" ON "ChatCommand"("enabled");
