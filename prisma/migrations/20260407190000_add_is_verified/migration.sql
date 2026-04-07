-- Add missing is_verified column to User table.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN DEFAULT FALSE;
