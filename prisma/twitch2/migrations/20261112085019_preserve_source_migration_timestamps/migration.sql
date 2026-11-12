-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NeonMigrationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" TEXT,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TEXT,
    "started_at" TEXT NOT NULL,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_NeonMigrationHistory" ("applied_steps_count", "checksum", "finished_at", "id", "logs", "migration_name", "rolled_back_at", "started_at") SELECT "applied_steps_count", "checksum", "finished_at", "id", "logs", "migration_name", "rolled_back_at", "started_at" FROM "NeonMigrationHistory";
DROP TABLE "NeonMigrationHistory";
ALTER TABLE "new_NeonMigrationHistory" RENAME TO "NeonMigrationHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
