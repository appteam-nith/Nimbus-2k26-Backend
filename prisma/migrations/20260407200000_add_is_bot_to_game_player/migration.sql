-- Add isBot column to GamePlayer (used for dev mode bot players)
ALTER TABLE "GamePlayer" ADD COLUMN IF NOT EXISTS "isBot" BOOLEAN NOT NULL DEFAULT false;
