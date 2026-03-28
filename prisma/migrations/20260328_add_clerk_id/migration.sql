-- Migration: add_clerk_id
-- Adds clerk_id as the primary Clerk-based identity link,
-- removes password/google_id/reset_token columns (now managed by Clerk).

-- 1. Drop old auth columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
ALTER TABLE "User" DROP COLUMN IF EXISTS "google_id";
ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token";
ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token_expires";

-- 2. Add clerk_id (nullable first so existing rows don't break)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerk_id" TEXT;

-- 3. Make clerk_id unique
ALTER TABLE "User" ADD CONSTRAINT "User_clerk_id_key" UNIQUE ("clerk_id");
