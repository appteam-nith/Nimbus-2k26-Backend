-- Migration: add_clerk_id
-- Adds clerk_id as the Clerk identity link.
-- Existing users from the old email/Google auth system are cleared
-- because they have no Clerk ID and cannot authenticate anymore.

-- Step 1: Drop old auth-only columns
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
ALTER TABLE "User" DROP COLUMN IF EXISTS "google_id";
ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token";
ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token_expires";

-- Step 2: Add clerk_id as nullable first (so existing rows don't block the alter)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerk_id" TEXT;

-- Step 3: Wipe legacy users (old email/Google accounts — no valid clerk_id possible)
DELETE FROM "User";

-- Step 4: Now enforce NOT NULL
ALTER TABLE "User" ALTER COLUMN "clerk_id" SET NOT NULL;

-- Step 5: Add unique constraint
ALTER TABLE "User" ADD CONSTRAINT "User_clerk_id_key" UNIQUE ("clerk_id");
