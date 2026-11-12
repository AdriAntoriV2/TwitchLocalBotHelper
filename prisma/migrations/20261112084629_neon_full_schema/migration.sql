/*
  Warnings:

  - You are about to drop the column `scopesJson` on the `TwitchAccount` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ChatCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "response" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "FirstRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "twitchRedemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "userDisplayName" TEXT NOT NULL,
    "redeemedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirstRedemption_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointPoolAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "attribution" TEXT NOT NULL DEFAULT 'GreedyKAITO',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,
    CONSTRAINT "PointPoolAdjustment_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointPoolEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PointPoolGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetPoints" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,
    CONSTRAINT "PointPoolGoal_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointPoolRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchRedemptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT NOT NULL,
    "userDisplayName" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "rewardTitle" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "redeemedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pointPoolEventId" TEXT NOT NULL,
    CONSTRAINT "PointPoolRedemption_pointPoolEventId_fkey" FOREIGN KEY ("pointPoolEventId") REFERENCES "PointPoolEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StreamEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalId" TEXT,
    CONSTRAINT "StreamEvent_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NeonMigrationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TwitchAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "scopes" JSONB,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_TwitchAccount" ("accessTokenEncrypted", "accessTokenExpiresAt", "connectedAt", "displayName", "id", "login", "refreshTokenEncrypted", "tokenVersion", "twitchUserId", "updatedAt") SELECT "accessTokenEncrypted", "accessTokenExpiresAt", "connectedAt", "displayName", "id", "login", "refreshTokenEncrypted", "tokenVersion", "twitchUserId", "updatedAt" FROM "TwitchAccount";
DROP TABLE "TwitchAccount";
ALTER TABLE "new_TwitchAccount" RENAME TO "TwitchAccount";
CREATE UNIQUE INDEX "TwitchAccount_twitchUserId_key" ON "TwitchAccount"("twitchUserId");
CREATE INDEX "TwitchAccount_login_idx" ON "TwitchAccount"("login");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChatCommand_name_key" ON "ChatCommand"("name");

-- CreateIndex
CREATE INDEX "ChatCommand_enabled_idx" ON "ChatCommand"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FirstRedemption_streamId_key" ON "FirstRedemption"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "FirstRedemption_twitchRedemptionId_key" ON "FirstRedemption"("twitchRedemptionId");

-- CreateIndex
CREATE INDEX "FirstRedemption_redeemedAt_idx" ON "FirstRedemption"("redeemedAt");

-- CreateIndex
CREATE INDEX "PointPoolAdjustment_pointPoolEventId_createdAt_idx" ON "PointPoolAdjustment"("pointPoolEventId", "createdAt");

-- CreateIndex
CREATE INDEX "PointPoolEvent_status_idx" ON "PointPoolEvent"("status");

-- CreateIndex
CREATE INDEX "PointPoolEvent_createdAt_idx" ON "PointPoolEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PointPoolGoal_pointPoolEventId_createdAt_idx" ON "PointPoolGoal"("pointPoolEventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointPoolRedemption_twitchRedemptionId_key" ON "PointPoolRedemption"("twitchRedemptionId");

-- CreateIndex
CREATE INDEX "PointPoolRedemption_pointPoolEventId_redeemedAt_idx" ON "PointPoolRedemption"("pointPoolEventId", "redeemedAt");

-- CreateIndex
CREATE INDEX "PointPoolRedemption_userId_idx" ON "PointPoolRedemption"("userId");

-- CreateIndex
CREATE INDEX "Stream_startedAt_idx" ON "Stream"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamEvent_externalId_key" ON "StreamEvent"("externalId");

-- CreateIndex
CREATE INDEX "StreamEvent_streamId_idx" ON "StreamEvent"("streamId");

-- CreateIndex
CREATE INDEX "StreamEvent_type_idx" ON "StreamEvent"("type");

-- CreateIndex
CREATE INDEX "StreamEvent_createdAt_idx" ON "StreamEvent"("createdAt");
