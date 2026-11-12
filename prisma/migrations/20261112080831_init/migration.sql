-- CreateTable
CREATE TABLE "TwitchAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "twitchUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "scopesJson" TEXT NOT NULL DEFAULT '[]',
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitchAccount_twitchUserId_key" ON "TwitchAccount"("twitchUserId");

-- CreateIndex
CREATE INDEX "TwitchAccount_login_idx" ON "TwitchAccount"("login");
