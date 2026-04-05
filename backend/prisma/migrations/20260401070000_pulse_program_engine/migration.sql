-- CreateEnum
CREATE TYPE "ProgramAccessMode" AS ENUM ('PRIVATE', 'RESTRICTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ProgramStructureType" AS ENUM ('FIXED_DURATION', 'ROLLING', 'OPEN_ENDED');

-- CreateEnum
CREATE TYPE "ProgramLifecycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramSourceType" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "ProgramActionType" AS ENUM ('TASK', 'HEALTH_CHECKIN', 'NUTRITION_TARGET', 'FINANCE_TARGET', 'JOURNAL', 'REFLECTION', 'REMINDER', 'INFO_ONLY', 'MILESTONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProgramIntegrationType" AS ENUM ('NONE', 'TASK_TRACKER', 'HEALTH', 'NUTRITION', 'FINANCE', 'JOURNAL', 'REMINDER', 'PULSE_WIDGET');

-- CreateEnum
CREATE TYPE "ProgramActionStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'MISSED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProgramRunStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ProgramDayStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'SKIPPED', 'MISSED', 'RECOVERY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramEventType" AS ENUM ('RUN_STARTED', 'ACTION_COMPLETED', 'ACTION_SKIPPED', 'ACTION_RESCHEDULED', 'DAY_COMPLETED', 'DAY_SKIPPED', 'RECOVERY_APPLIED', 'RUN_PAUSED', 'RUN_RESUMED', 'RUN_CANCELLED', 'RUN_ARCHIVED', 'RUN_COMPLETED', 'SESSION_JOINED', 'SESSION_LEFT', 'SESSION_STARTED', 'SESSION_COMPLETED');

-- CreateEnum
CREATE TYPE "ProgramRecoveryResolution" AS ENUM ('CONTINUE_CURRENT_DAY', 'SOFT_CATCH_UP', 'SHIFT_FORWARD', 'RECOVERY_DAY', 'SKIP_DAY', 'COMPLETE_AS_DONE', 'COMPLETE_PARTIAL');

-- CreateEnum
CREATE TYPE "ProgramSessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramSessionJoinMode" AS ENUM ('INVITE_ONLY', 'LINK', 'OPEN');

-- CreateEnum
CREATE TYPE "ProgramSessionStartMode" AS ENUM ('NOW', 'SCHEDULED', 'HOST_MANUAL', 'AUTO_ON_ACCEPT');

-- CreateEnum
CREATE TYPE "ProgramSessionRole" AS ENUM ('HOST', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProgramSessionMemberStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "ProgramInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProgramShareMode" AS ENUM ('SNAPSHOT', 'REFERENCE', 'INVITE');

-- CreateEnum
CREATE TYPE "PulseShareArtifactKind" AS ENUM ('WIDGET', 'METRIC', 'PROGRAM', 'PROGRAM_INVITE', 'SESSION_INVITE', 'PROGRAM_SUMMARY', 'PROGRAM_PROGRESS', 'ACHIEVEMENT', 'TODAY_ACTIONS');

-- CreateEnum
CREATE TYPE "AchievementDomain" AS ENUM ('PULSE');

-- CreateEnum
CREATE TYPE "AchievementDefinitionKind" AS ENUM ('PROGRAM_COMPLETION', 'STAGE_COMPLETION', 'MILESTONE', 'STREAK', 'ADHERENCE', 'RECOVERY', 'COLLABORATIVE', 'TEAM_COMPLETION', 'PROGRAM_OUTCOME');

-- AlterTable
ALTER TABLE "UserPrivacy" ADD COLUMN     "showPulseAchievements" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProgramDefinition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "sourceType" "ProgramSourceType" NOT NULL DEFAULT 'USER',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "theme" TEXT,
    "language" TEXT DEFAULT 'ru',
    "coverUrl" TEXT,
    "durationDays" INTEGER,
    "accessMode" "ProgramAccessMode" NOT NULL DEFAULT 'PRIVATE',
    "structureType" "ProgramStructureType" NOT NULL DEFAULT 'FIXED_DURATION',
    "collaborativeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lifecycleStatus" "ProgramLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "theme" TEXT,
    "language" TEXT DEFAULT 'ru',
    "coverUrl" TEXT,
    "durationDays" INTEGER,
    "accessMode" "ProgramAccessMode" NOT NULL DEFAULT 'PRIVATE',
    "structureType" "ProgramStructureType" NOT NULL DEFAULT 'FIXED_DURATION',
    "collaborativeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAccessGrant" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRuleSet" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT,
    "programVersionId" TEXT,
    "allowSkip" BOOLEAN NOT NULL DEFAULT true,
    "allowPause" BOOLEAN NOT NULL DEFAULT true,
    "allowResume" BOOLEAN NOT NULL DEFAULT true,
    "allowCancel" BOOLEAN NOT NULL DEFAULT true,
    "allowRecovery" BOOLEAN NOT NULL DEFAULT true,
    "maxReschedulesPerAction" INTEGER NOT NULL DEFAULT 3,
    "recoveryConfigJson" JSONB,
    "progressConfigJson" JSONB,
    "integrationConfigJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramStage" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT,
    "programVersionId" TEXT,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDay" INTEGER,
    "endDay" INTEGER,
    "milestoneText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDayTemplate" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT,
    "programVersionId" TEXT,
    "programStageId" TEXT,
    "dayNumber" INTEGER,
    "title" TEXT,
    "dayText" TEXT,
    "tipOfDay" TEXT,
    "motivationOfDay" TEXT,
    "reflectionPrompt" TEXT,
    "isRecoveryTemplate" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramDayTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramActionTemplate" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT,
    "programVersionId" TEXT,
    "programDayTemplateId" TEXT,
    "programStageId" TEXT,
    "order" INTEGER NOT NULL,
    "actionType" "ProgramActionType" NOT NULL,
    "integrationType" "ProgramIntegrationType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER,
    "completionPolicy" TEXT,
    "reschedulePolicy" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramActionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramMilestoneTemplate" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT,
    "programVersionId" TEXT,
    "programStageId" TEXT,
    "programDayTemplateId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDay" INTEGER,
    "metricKey" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramMilestoneTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRun" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" "ProgramRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "currentDayNumber" INTEGER NOT NULL DEFAULT 1,
    "currentStageId" TEXT,
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "adherenceScore" INTEGER NOT NULL DEFAULT 100,
    "consistencyScore" INTEGER NOT NULL DEFAULT 100,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "missedDaysCount" INTEGER NOT NULL DEFAULT 0,
    "skippedActionsCount" INTEGER NOT NULL DEFAULT 0,
    "rescheduledActionsCount" INTEGER NOT NULL DEFAULT 0,
    "stageCompletionPercent" INTEGER NOT NULL DEFAULT 0,
    "milestonesEarnedCount" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "lastRecoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRunDay" (
    "id" TEXT NOT NULL,
    "programRunId" TEXT NOT NULL,
    "programStageId" TEXT,
    "programDayTemplateId" TEXT,
    "sequenceNumber" INTEGER NOT NULL,
    "programDayNumber" INTEGER,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" "ProgramDayStatus" NOT NULL DEFAULT 'UPCOMING',
    "isRecoveryDay" BOOLEAN NOT NULL DEFAULT false,
    "completedRequiredCount" INTEGER NOT NULL DEFAULT 0,
    "completedOptionalCount" INTEGER NOT NULL DEFAULT 0,
    "requiredCount" INTEGER NOT NULL DEFAULT 0,
    "optionalCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRunDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRunAction" (
    "id" TEXT NOT NULL,
    "programRunId" TEXT NOT NULL,
    "programRunDayId" TEXT NOT NULL,
    "programActionTemplateId" TEXT,
    "programStageId" TEXT,
    "order" INTEGER NOT NULL,
    "actionType" "ProgramActionType" NOT NULL,
    "integrationType" "ProgramIntegrationType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER,
    "completionPolicy" TEXT,
    "reschedulePolicy" TEXT,
    "payloadJson" JSONB,
    "status" "ProgramActionStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "rescheduledToDate" TIMESTAMP(3),
    "completionNote" TEXT,
    "reflectionText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRunAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRunEvent" (
    "id" TEXT NOT NULL,
    "programRunId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "ProgramEventType" NOT NULL,
    "message" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRecoveryEvent" (
    "id" TEXT NOT NULL,
    "programRunId" TEXT NOT NULL,
    "programRunDayId" TEXT,
    "userId" TEXT NOT NULL,
    "resolution" "ProgramRecoveryResolution" NOT NULL,
    "reasonText" TEXT,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramRecoveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTaskLink" (
    "id" TEXT NOT NULL,
    "programRunId" TEXT NOT NULL,
    "programRunActionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "syncState" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSession" (
    "id" TEXT NOT NULL,
    "programDefinitionId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT,
    "status" "ProgramSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "joinMode" "ProgramSessionJoinMode" NOT NULL DEFAULT 'INVITE_ONLY',
    "startMode" "ProgramSessionStartMode" NOT NULL DEFAULT 'HOST_MANUAL',
    "scheduledStartAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "shareStatus" BOOLEAN NOT NULL DEFAULT true,
    "shareNumbers" BOOLEAN NOT NULL DEFAULT false,
    "shareMisses" BOOLEAN NOT NULL DEFAULT false,
    "shareMilestones" BOOLEAN NOT NULL DEFAULT true,
    "metricsVisibleJson" JSONB,
    "inviteLinkToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSessionMember" (
    "id" TEXT NOT NULL,
    "programSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programRunId" TEXT,
    "role" "ProgramSessionRole" NOT NULL DEFAULT 'MEMBER',
    "status" "ProgramSessionMemberStatus" NOT NULL DEFAULT 'PENDING',
    "shareStatus" BOOLEAN NOT NULL DEFAULT true,
    "shareNumbers" BOOLEAN NOT NULL DEFAULT false,
    "shareMisses" BOOLEAN NOT NULL DEFAULT false,
    "shareMilestones" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramSessionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSessionInvite" (
    "id" TEXT NOT NULL,
    "programSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientUsername" TEXT,
    "inviteToken" TEXT NOT NULL,
    "status" "ProgramInviteStatus" NOT NULL DEFAULT 'PENDING',
    "channel" TEXT,
    "shareArtifactId" TEXT,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramSessionInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseShareArtifact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "PulseShareArtifactKind" NOT NULL,
    "mode" "ProgramShareMode" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "snapshotJson" JSONB,
    "referenceJson" JSONB,
    "inviteToken" TEXT,
    "visibilityScope" "ProgramAccessMode" NOT NULL DEFAULT 'PRIVATE',
    "containsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "allowPublicReference" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseShareArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" "AchievementDomain" NOT NULL DEFAULT 'PULSE',
    "kind" "AchievementDefinitionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "badgeTone" TEXT,
    "metricThreshold" INTEGER,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementDefinitionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "programRunId" TEXT,
    "programSessionId" TEXT,
    "shareArtifactId" TEXT,
    "titleSnapshot" TEXT,
    "descriptionSnapshot" TEXT,
    "uniqueKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progressValue" INTEGER,
    "progressMax" INTEGER,
    "resultJson" JSONB,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramDefinition_ownerId_createdAt_idx" ON "ProgramDefinition"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramDefinition_accessMode_lifecycleStatus_publishedAt_idx" ON "ProgramDefinition"("accessMode", "lifecycleStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "ProgramVersion_definitionId_publishedAt_idx" ON "ProgramVersion"("definitionId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_definitionId_versionNumber_key" ON "ProgramVersion"("definitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProgramAccessGrant_userId_createdAt_idx" ON "ProgramAccessGrant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAccessGrant_programDefinitionId_userId_key" ON "ProgramAccessGrant"("programDefinitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRuleSet_programDefinitionId_key" ON "ProgramRuleSet"("programDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRuleSet_programVersionId_key" ON "ProgramRuleSet"("programVersionId");

-- CreateIndex
CREATE INDEX "ProgramStage_programDefinitionId_order_idx" ON "ProgramStage"("programDefinitionId", "order");

-- CreateIndex
CREATE INDEX "ProgramStage_programVersionId_order_idx" ON "ProgramStage"("programVersionId", "order");

-- CreateIndex
CREATE INDEX "ProgramDayTemplate_programDefinitionId_dayNumber_idx" ON "ProgramDayTemplate"("programDefinitionId", "dayNumber");

-- CreateIndex
CREATE INDEX "ProgramDayTemplate_programVersionId_dayNumber_idx" ON "ProgramDayTemplate"("programVersionId", "dayNumber");

-- CreateIndex
CREATE INDEX "ProgramActionTemplate_programDefinitionId_order_idx" ON "ProgramActionTemplate"("programDefinitionId", "order");

-- CreateIndex
CREATE INDEX "ProgramActionTemplate_programVersionId_order_idx" ON "ProgramActionTemplate"("programVersionId", "order");

-- CreateIndex
CREATE INDEX "ProgramActionTemplate_programDayTemplateId_order_idx" ON "ProgramActionTemplate"("programDayTemplateId", "order");

-- CreateIndex
CREATE INDEX "ProgramMilestoneTemplate_programDefinitionId_order_idx" ON "ProgramMilestoneTemplate"("programDefinitionId", "order");

-- CreateIndex
CREATE INDEX "ProgramMilestoneTemplate_programVersionId_order_idx" ON "ProgramMilestoneTemplate"("programVersionId", "order");

-- CreateIndex
CREATE INDEX "ProgramRun_userId_status_updatedAt_idx" ON "ProgramRun"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ProgramRun_programDefinitionId_status_idx" ON "ProgramRun"("programDefinitionId", "status");

-- CreateIndex
CREATE INDEX "ProgramRun_sessionId_status_idx" ON "ProgramRun"("sessionId", "status");

-- CreateIndex
CREATE INDEX "ProgramRunDay_programRunId_scheduledDate_idx" ON "ProgramRunDay"("programRunId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRunDay_programRunId_sequenceNumber_key" ON "ProgramRunDay"("programRunId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "ProgramRunAction_programRunId_scheduledDate_status_idx" ON "ProgramRunAction"("programRunId", "scheduledDate", "status");

-- CreateIndex
CREATE INDEX "ProgramRunAction_programRunDayId_order_idx" ON "ProgramRunAction"("programRunDayId", "order");

-- CreateIndex
CREATE INDEX "ProgramRunEvent_programRunId_createdAt_idx" ON "ProgramRunEvent"("programRunId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramRunEvent_userId_createdAt_idx" ON "ProgramRunEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramRecoveryEvent_programRunId_createdAt_idx" ON "ProgramRecoveryEvent"("programRunId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramRecoveryEvent_userId_createdAt_idx" ON "ProgramRecoveryEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTaskLink_taskId_key" ON "ProgramTaskLink"("taskId");

-- CreateIndex
CREATE INDEX "ProgramTaskLink_programRunId_syncState_idx" ON "ProgramTaskLink"("programRunId", "syncState");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTaskLink_programRunActionId_taskId_key" ON "ProgramTaskLink"("programRunActionId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSession_inviteLinkToken_key" ON "ProgramSession"("inviteLinkToken");

-- CreateIndex
CREATE INDEX "ProgramSession_hostId_status_updatedAt_idx" ON "ProgramSession"("hostId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ProgramSession_programDefinitionId_status_idx" ON "ProgramSession"("programDefinitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSessionMember_programRunId_key" ON "ProgramSessionMember"("programRunId");

-- CreateIndex
CREATE INDEX "ProgramSessionMember_userId_status_updatedAt_idx" ON "ProgramSessionMember"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSessionMember_programSessionId_userId_key" ON "ProgramSessionMember"("programSessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSessionInvite_inviteToken_key" ON "ProgramSessionInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "ProgramSessionInvite_programSessionId_status_createdAt_idx" ON "ProgramSessionInvite"("programSessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramSessionInvite_recipientId_status_createdAt_idx" ON "ProgramSessionInvite"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PulseShareArtifact_inviteToken_key" ON "PulseShareArtifact"("inviteToken");

-- CreateIndex
CREATE INDEX "PulseShareArtifact_ownerId_createdAt_idx" ON "PulseShareArtifact"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PulseShareArtifact_kind_mode_createdAt_idx" ON "PulseShareArtifact"("kind", "mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementDefinition_slug_key" ON "AchievementDefinition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_uniqueKey_key" ON "UserAchievement"("uniqueKey");

-- CreateIndex
CREATE INDEX "UserAchievement_userId_awardedAt_idx" ON "UserAchievement"("userId", "awardedAt");

-- CreateIndex
CREATE INDEX "UserAchievement_achievementDefinitionId_awardedAt_idx" ON "UserAchievement"("achievementDefinitionId", "awardedAt");

-- AddForeignKey
ALTER TABLE "ProgramDefinition" ADD CONSTRAINT "ProgramDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDefinition" ADD CONSTRAINT "ProgramDefinition_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProgramVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAccessGrant" ADD CONSTRAINT "ProgramAccessGrant_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAccessGrant" ADD CONSTRAINT "ProgramAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAccessGrant" ADD CONSTRAINT "ProgramAccessGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRuleSet" ADD CONSTRAINT "ProgramRuleSet_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRuleSet" ADD CONSTRAINT "ProgramRuleSet_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStage" ADD CONSTRAINT "ProgramStage_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStage" ADD CONSTRAINT "ProgramStage_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayTemplate" ADD CONSTRAINT "ProgramDayTemplate_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayTemplate" ADD CONSTRAINT "ProgramDayTemplate_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayTemplate" ADD CONSTRAINT "ProgramDayTemplate_programStageId_fkey" FOREIGN KEY ("programStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActionTemplate" ADD CONSTRAINT "ProgramActionTemplate_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActionTemplate" ADD CONSTRAINT "ProgramActionTemplate_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActionTemplate" ADD CONSTRAINT "ProgramActionTemplate_programDayTemplateId_fkey" FOREIGN KEY ("programDayTemplateId") REFERENCES "ProgramDayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramActionTemplate" ADD CONSTRAINT "ProgramActionTemplate_programStageId_fkey" FOREIGN KEY ("programStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMilestoneTemplate" ADD CONSTRAINT "ProgramMilestoneTemplate_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMilestoneTemplate" ADD CONSTRAINT "ProgramMilestoneTemplate_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMilestoneTemplate" ADD CONSTRAINT "ProgramMilestoneTemplate_programStageId_fkey" FOREIGN KEY ("programStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMilestoneTemplate" ADD CONSTRAINT "ProgramMilestoneTemplate_programDayTemplateId_fkey" FOREIGN KEY ("programDayTemplateId") REFERENCES "ProgramDayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRun" ADD CONSTRAINT "ProgramRun_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRun" ADD CONSTRAINT "ProgramRun_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRun" ADD CONSTRAINT "ProgramRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRun" ADD CONSTRAINT "ProgramRun_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRun" ADD CONSTRAINT "ProgramRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgramSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunDay" ADD CONSTRAINT "ProgramRunDay_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunDay" ADD CONSTRAINT "ProgramRunDay_programStageId_fkey" FOREIGN KEY ("programStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunDay" ADD CONSTRAINT "ProgramRunDay_programDayTemplateId_fkey" FOREIGN KEY ("programDayTemplateId") REFERENCES "ProgramDayTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunAction" ADD CONSTRAINT "ProgramRunAction_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunAction" ADD CONSTRAINT "ProgramRunAction_programRunDayId_fkey" FOREIGN KEY ("programRunDayId") REFERENCES "ProgramRunDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunAction" ADD CONSTRAINT "ProgramRunAction_programActionTemplateId_fkey" FOREIGN KEY ("programActionTemplateId") REFERENCES "ProgramActionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunAction" ADD CONSTRAINT "ProgramRunAction_programStageId_fkey" FOREIGN KEY ("programStageId") REFERENCES "ProgramStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunEvent" ADD CONSTRAINT "ProgramRunEvent_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRunEvent" ADD CONSTRAINT "ProgramRunEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRecoveryEvent" ADD CONSTRAINT "ProgramRecoveryEvent_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRecoveryEvent" ADD CONSTRAINT "ProgramRecoveryEvent_programRunDayId_fkey" FOREIGN KEY ("programRunDayId") REFERENCES "ProgramRunDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRecoveryEvent" ADD CONSTRAINT "ProgramRecoveryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTaskLink" ADD CONSTRAINT "ProgramTaskLink_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTaskLink" ADD CONSTRAINT "ProgramTaskLink_programRunActionId_fkey" FOREIGN KEY ("programRunActionId") REFERENCES "ProgramRunAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTaskLink" ADD CONSTRAINT "ProgramTaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_programDefinitionId_fkey" FOREIGN KEY ("programDefinitionId") REFERENCES "ProgramDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionMember" ADD CONSTRAINT "ProgramSessionMember_programSessionId_fkey" FOREIGN KEY ("programSessionId") REFERENCES "ProgramSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionMember" ADD CONSTRAINT "ProgramSessionMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionMember" ADD CONSTRAINT "ProgramSessionMember_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionInvite" ADD CONSTRAINT "ProgramSessionInvite_programSessionId_fkey" FOREIGN KEY ("programSessionId") REFERENCES "ProgramSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionInvite" ADD CONSTRAINT "ProgramSessionInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionInvite" ADD CONSTRAINT "ProgramSessionInvite_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSessionInvite" ADD CONSTRAINT "ProgramSessionInvite_shareArtifactId_fkey" FOREIGN KEY ("shareArtifactId") REFERENCES "PulseShareArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseShareArtifact" ADD CONSTRAINT "PulseShareArtifact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementDefinitionId_fkey" FOREIGN KEY ("achievementDefinitionId") REFERENCES "AchievementDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_programRunId_fkey" FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_programSessionId_fkey" FOREIGN KEY ("programSessionId") REFERENCES "ProgramSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_shareArtifactId_fkey" FOREIGN KEY ("shareArtifactId") REFERENCES "PulseShareArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

