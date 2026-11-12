-- CreateTable
CREATE TABLE "AutomationActionExecution" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "actionIndex" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationActionExecution_executionId_idx" ON "AutomationActionExecution"("executionId");

-- CreateIndex
CREATE INDEX "AutomationActionExecution_status_idx" ON "AutomationActionExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationActionExecution_executionId_actionIndex_key" ON "AutomationActionExecution"("executionId", "actionIndex");

-- AddForeignKey
ALTER TABLE "AutomationActionExecution" ADD CONSTRAINT "AutomationActionExecution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
