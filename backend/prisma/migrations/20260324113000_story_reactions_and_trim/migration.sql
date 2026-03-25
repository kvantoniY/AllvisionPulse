ALTER TABLE "Story"
  ADD COLUMN "trimStartMs" INTEGER,
  ADD COLUMN "trimEndMs" INTEGER,
  ADD COLUMN "transformJson" JSONB;

ALTER TABLE "StoryView"
  ADD COLUMN "reaction" TEXT;
