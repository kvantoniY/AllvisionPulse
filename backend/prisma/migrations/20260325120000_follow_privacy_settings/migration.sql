ALTER TABLE "UserPrivacy"
  ADD COLUMN IF NOT EXISTS "profileVisibility" TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS "allowCallsFrom" TEXT NOT NULL DEFAULT 'everyone';

ALTER TABLE "UserPrivacy"
  ALTER COLUMN "allowMessagesFrom" SET DEFAULT 'everyone';

UPDATE "UserPrivacy"
SET "allowMessagesFrom" = CASE
  WHEN "allowMessagesFrom" = 'friends' THEN 'followers'
  ELSE COALESCE("allowMessagesFrom", 'everyone')
END,
"profileVisibility" = COALESCE("profileVisibility", 'everyone'),
"allowCallsFrom" = COALESCE("allowCallsFrom", 'everyone');
