DO $$
BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ARTIFACT_ACTIVITY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "PulseShareArtifactKind" ADD VALUE 'TASK';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "PulseShareArtifactKind" ADD VALUE 'FINANCE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "PulseShareArtifactKind" ADD VALUE 'DEBT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "PulseShareArtifactKind" ADD VALUE 'SAVINGS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "PulseShareArtifactKind" ADD VALUE 'ACTION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PulseActionArtifactType" AS ENUM (
    'TASK_REQUEST',
    'TASK_SUGGESTION',
    'SOCIAL_EVENT',
    'REMINDER_CARD',
    'FINANCE_SPLIT',
    'DEBT_SHARE',
    'SAVINGS_SHARE',
    'PROGRAM_INVITE',
    'PROGRAM_SESSION_INVITE',
    'PROGRAM_PROGRESS_SHARE',
    'METRIC_SHARE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PulseArtifactParticipantRole" AS ENUM ('AUTHOR', 'TARGET', 'PARTICIPANT', 'WATCHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PulseArtifactParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'ADDED', 'COMPLETED', 'FOLLOWING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PulseArtifactActivityType" AS ENUM (
    'CREATED',
    'SHARED_TO_CHAT',
    'ACCEPTED',
    'DECLINED',
    'ADDED_TO_PULSE',
    'COMPLETED',
    'FOLLOWED',
    'REMINDER_SET',
    'SETTLED',
    'UPDATED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PulseShareArtifact"
  ADD COLUMN "actionType" "PulseActionArtifactType",
  ADD COLUMN "payloadJson" JSONB,
  ADD COLUMN "originChatId" TEXT,
  ADD COLUMN "originMessageId" TEXT;

CREATE TABLE "PulseArtifactAcceptance" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "PulseArtifactParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
  "status" "PulseArtifactParticipantStatus" NOT NULL DEFAULT 'PENDING',
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "addedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "followedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "taskId" TEXT,
  "financeEntryId" TEXT,
  "debtId" TEXT,
  "savingsGoalId" TEXT,
  "programRunId" TEXT,
  "programSessionId" TEXT,
  "metaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PulseArtifactAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PulseArtifactActivity" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "actorId" TEXT,
  "subjectUserId" TEXT,
  "type" "PulseArtifactActivityType" NOT NULL,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PulseArtifactActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PulseShareArtifact_originChatId_createdAt_idx" ON "PulseShareArtifact"("originChatId", "createdAt");
CREATE UNIQUE INDEX "PulseArtifactAcceptance_artifactId_userId_key" ON "PulseArtifactAcceptance"("artifactId", "userId");
CREATE INDEX "PulseArtifactAcceptance_userId_status_updatedAt_idx" ON "PulseArtifactAcceptance"("userId", "status", "updatedAt");
CREATE INDEX "PulseArtifactAcceptance_taskId_idx" ON "PulseArtifactAcceptance"("taskId");
CREATE INDEX "PulseArtifactAcceptance_financeEntryId_idx" ON "PulseArtifactAcceptance"("financeEntryId");
CREATE INDEX "PulseArtifactAcceptance_debtId_idx" ON "PulseArtifactAcceptance"("debtId");
CREATE INDEX "PulseArtifactAcceptance_savingsGoalId_idx" ON "PulseArtifactAcceptance"("savingsGoalId");
CREATE INDEX "PulseArtifactAcceptance_programRunId_idx" ON "PulseArtifactAcceptance"("programRunId");
CREATE INDEX "PulseArtifactAcceptance_programSessionId_idx" ON "PulseArtifactAcceptance"("programSessionId");
CREATE INDEX "PulseArtifactActivity_artifactId_createdAt_idx" ON "PulseArtifactActivity"("artifactId", "createdAt");
CREATE INDEX "PulseArtifactActivity_actorId_createdAt_idx" ON "PulseArtifactActivity"("actorId", "createdAt");
CREATE INDEX "PulseArtifactActivity_subjectUserId_createdAt_idx" ON "PulseArtifactActivity"("subjectUserId", "createdAt");

ALTER TABLE "PulseShareArtifact"
  ADD CONSTRAINT "PulseShareArtifact_originChatId_fkey"
  FOREIGN KEY ("originChatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseShareArtifact"
  ADD CONSTRAINT "PulseShareArtifact_originMessageId_fkey"
  FOREIGN KEY ("originMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "PulseShareArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_financeEntryId_fkey"
  FOREIGN KEY ("financeEntryId") REFERENCES "PulseFinanceEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "PulseDebt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_savingsGoalId_fkey"
  FOREIGN KEY ("savingsGoalId") REFERENCES "PulseSavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_programRunId_fkey"
  FOREIGN KEY ("programRunId") REFERENCES "ProgramRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactAcceptance"
  ADD CONSTRAINT "PulseArtifactAcceptance_programSessionId_fkey"
  FOREIGN KEY ("programSessionId") REFERENCES "ProgramSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactActivity"
  ADD CONSTRAINT "PulseArtifactActivity_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "PulseShareArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactActivity"
  ADD CONSTRAINT "PulseArtifactActivity_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PulseArtifactActivity"
  ADD CONSTRAINT "PulseArtifactActivity_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
