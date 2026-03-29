-- Migration: replace_clerk_with_google_and_otp
--
-- Changes:
--   • Drops clerk_id column (Clerk removed)
--   • Adds google_id as NULLABLE (email/OTP users have no google_id)
--   • Existing email-based users are preserved
--   • Clerk-only users (clerk_id starting with "user_") are wiped
--     because they have no usable email/OTP identity

-- Step 1: Remove the Clerk unique constraint and column
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_clerk_id_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "clerk_id";

-- Step 2: Add google_id as nullable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "google_id" TEXT;

-- Step 3: Add unique constraint on google_id (partial — only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS "User_google_id_key"
  ON "User" ("google_id")
  WHERE "google_id" IS NOT NULL;
