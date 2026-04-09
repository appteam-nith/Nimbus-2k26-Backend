/*
  Align experience defaults and enforce non-negative points.
*/

-- Ensure baseline and null safety
UPDATE "User" SET "experience" = 1000 WHERE "experience" IS NULL OR "experience" = 0;
UPDATE "User" SET "experience" = 0 WHERE "experience" < 0;

-- Ensure future users start from 1000
ALTER TABLE "User" ALTER COLUMN "experience" SET DEFAULT 1000;
ALTER TABLE "User" ALTER COLUMN "experience" SET NOT NULL;

-- Prevent negative experience at the DB level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_experience_non_negative'
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_experience_non_negative"
    CHECK ("experience" >= 0);
  END IF;
END $$;
