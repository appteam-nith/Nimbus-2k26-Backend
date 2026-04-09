/*
  Add experience and experience_updated_at to User table, set defaults and index.
*/

-- Add columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "experience" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "experience_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill any NULL timestamps using created_at
UPDATE "User" SET "experience_updated_at" = created_at WHERE "experience_updated_at" IS NULL;

-- Index to support leaderboard ordering: highest experience first, earlier achievers first, then name
CREATE INDEX IF NOT EXISTS "User_experience_idx" ON "User" ("experience" DESC, "experience_updated_at" ASC, "full_name" ASC);
