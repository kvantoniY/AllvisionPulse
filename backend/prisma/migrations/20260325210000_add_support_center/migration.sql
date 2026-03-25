DO $$ BEGIN
  CREATE TYPE "SupportTicketKind" AS ENUM ('PROBLEM', 'IDEA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupportQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "kind" "SupportTicketKind" NOT NULL DEFAULT 'PROBLEM',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "lastReplyAt" TIMESTAMP(3),

  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportTicketReply" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportQuestion" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "status" "SupportQuestionStatus" NOT NULL DEFAULT 'OPEN',
  "answerText" TEXT,
  "answerAuthorId" TEXT,
  "answeredAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportQuestionLike" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportQuestionLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupportQuestionLike_questionId_userId_key" ON "SupportQuestionLike"("questionId", "userId");

CREATE INDEX IF NOT EXISTS "SupportTicket_authorId_status_idx" ON "SupportTicket"("authorId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "SupportTicketReply_ticketId_createdAt_idx" ON "SupportTicketReply"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicketReply_authorId_createdAt_idx" ON "SupportTicketReply"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportQuestion_status_createdAt_idx" ON "SupportQuestion"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportQuestion_archivedAt_idx" ON "SupportQuestion"("archivedAt");
CREATE INDEX IF NOT EXISTS "SupportQuestion_authorId_createdAt_idx" ON "SupportQuestion"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportQuestionLike_userId_createdAt_idx" ON "SupportQuestionLike"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketReply"
    ADD CONSTRAINT "SupportTicketReply_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicketReply"
    ADD CONSTRAINT "SupportTicketReply_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportQuestion"
    ADD CONSTRAINT "SupportQuestion_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportQuestion"
    ADD CONSTRAINT "SupportQuestion_answerAuthorId_fkey"
    FOREIGN KEY ("answerAuthorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportQuestionLike"
    ADD CONSTRAINT "SupportQuestionLike_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "SupportQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportQuestionLike"
    ADD CONSTRAINT "SupportQuestionLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
