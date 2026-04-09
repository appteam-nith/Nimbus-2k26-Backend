/*
  Add optional, non-unique nickname for chat identity.
*/

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "nickname" TEXT;
