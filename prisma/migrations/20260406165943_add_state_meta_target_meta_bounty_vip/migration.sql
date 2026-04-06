-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameRole" ADD VALUE 'HITMAN';
ALTER TYPE "GameRole" ADD VALUE 'BOUNTY_HUNTER';
ALTER TYPE "GameRole" ADD VALUE 'PROPHET';
ALTER TYPE "GameRole" ADD VALUE 'REPORTER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoteType" ADD VALUE 'HITMAN_TARGET';
ALTER TYPE "VoteType" ADD VALUE 'BOUNTY_HUNTER_VIP';
ALTER TYPE "VoteType" ADD VALUE 'BOUNTY_HUNTER_SHOT';
ALTER TYPE "VoteType" ADD VALUE 'REPORTER_EXPOSE';

-- AlterTable
ALTER TABLE "GameRoom" ADD COLUMN     "state_meta" JSONB DEFAULT '{}';

-- AlterTable
ALTER TABLE "GameVote" ADD COLUMN     "target_meta" JSONB;
