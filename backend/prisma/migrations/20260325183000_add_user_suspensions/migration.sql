ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspendedPermanent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT;

UPDATE "User"
SET "suspendedPermanent" = COALESCE("suspendedPermanent", false)
WHERE "suspendedPermanent" IS NULL;
