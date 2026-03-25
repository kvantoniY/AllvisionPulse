-- Add persistent game sessions storage.
-- Safe to run on databases where GameRoom was created manually.

CREATE TABLE IF NOT EXISTS "GameRoom" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "currentGameKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GameRoom_roomId_key" ON "GameRoom"("roomId");

ALTER TABLE "GameRoom" ADD COLUMN IF NOT EXISTS "currentGameKey" TEXT;
ALTER TABLE "GameRoom" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GameRoom" ADD COLUMN IF NOT EXISTS "meta" JSONB;
