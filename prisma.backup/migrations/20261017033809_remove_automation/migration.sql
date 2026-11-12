/*
  Warnings:

  - You are about to drop the `AutomationActionExecution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AutomationExecution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AutomationRule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AutomationActionExecution" DROP CONSTRAINT "AutomationActionExecution_executionId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationExecution" DROP CONSTRAINT "AutomationExecution_eventId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationExecution" DROP CONSTRAINT "AutomationExecution_ruleId_fkey";

-- DropTable
DROP TABLE "AutomationActionExecution";

-- DropTable
DROP TABLE "AutomationExecution";

-- DropTable
DROP TABLE "AutomationRule";
