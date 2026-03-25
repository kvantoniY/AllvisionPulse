DO $$ BEGIN
  CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'PAGE_LEAVE', 'HEARTBEAT', 'ACTION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AnalyticsSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "landingPath" TEXT,
  "exitPath" TEXT,
  "pageViews" INTEGER NOT NULL DEFAULT 0,
  "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "sessionKey" TEXT NOT NULL,
  "type" "AnalyticsEventType" NOT NULL,
  "path" TEXT NOT NULL,
  "pageLabel" TEXT,
  "referrerPath" TEXT,
  "actionKey" TEXT,
  "durationSec" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsSession_userId_sessionKey_key" ON "AnalyticsSession"("userId", "sessionKey");

CREATE INDEX IF NOT EXISTS "AnalyticsSession_lastSeenAt_idx" ON "AnalyticsSession"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_startedAt_idx" ON "AnalyticsSession"("startedAt");
CREATE INDEX IF NOT EXISTS "AnalyticsSession_userId_startedAt_idx" ON "AnalyticsSession"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_path_createdAt_idx" ON "AnalyticsEvent"("path", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_sessionKey_createdAt_idx" ON "AnalyticsEvent"("sessionKey", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AnalyticsSession"
    ADD CONSTRAINT "AnalyticsSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AnalyticsEvent"
    ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AnalyticsEvent"
    ADD CONSTRAINT "AnalyticsEvent_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AnalyticsSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
