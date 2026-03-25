ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "metaJson" JSONB;

CREATE TABLE IF NOT EXISTS "StoryHighlight" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryHighlight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StoryHighlightItem" (
  "id" TEXT NOT NULL,
  "highlightId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryHighlightItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoryHighlight_userId_updatedAt_idx" ON "StoryHighlight"("userId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "StoryHighlightItem_highlightId_storyId_key" ON "StoryHighlightItem"("highlightId", "storyId");
CREATE INDEX IF NOT EXISTS "StoryHighlightItem_storyId_idx" ON "StoryHighlightItem"("storyId");

DO $$ BEGIN
  ALTER TABLE "StoryHighlight"
    ADD CONSTRAINT "StoryHighlight_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StoryHighlightItem"
    ADD CONSTRAINT "StoryHighlightItem_highlightId_fkey"
    FOREIGN KEY ("highlightId") REFERENCES "StoryHighlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StoryHighlightItem"
    ADD CONSTRAINT "StoryHighlightItem_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
