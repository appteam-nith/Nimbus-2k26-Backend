/*
  Warnings:

  - You are about to drop the column `virtual_balance` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Stock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockPrice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TradeTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserPortfolio` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[google_id]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'DISCUSSION', 'NIGHT', 'VOTING', 'REVEAL', 'ENDED');

-- CreateEnum
CREATE TYPE "GameWinner" AS ENUM ('MAFIA', 'CITIZENS');

-- CreateEnum
CREATE TYPE "GameRole" AS ENUM ('MAFIA', 'MAFIA_HELPER', 'CITIZEN', 'DOCTOR', 'COP', 'NURSE');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ALIVE', 'ELIMINATED');

-- CreateEnum
CREATE TYPE "GameRoomSize" AS ENUM ('FIVE', 'EIGHT', 'TWELVE');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('DAY_LYNCH', 'MAFIA_TARGET', 'DOC_SAVE', 'COP_INVESTIGATE', 'NURSE_ACTION');

-- DropForeignKey
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_club_id_fkey";

-- DropForeignKey
ALTER TABLE "StockPrice" DROP CONSTRAINT "StockPrice_stock_id_fkey";

-- DropForeignKey
ALTER TABLE "TradeTransaction" DROP CONSTRAINT "TradeTransaction_stock_id_fkey";

-- DropForeignKey
ALTER TABLE "TradeTransaction" DROP CONSTRAINT "TradeTransaction_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UserPortfolio" DROP CONSTRAINT "UserPortfolio_stock_id_fkey";

-- DropForeignKey
ALTER TABLE "UserPortfolio" DROP CONSTRAINT "UserPortfolio_user_id_fkey";

-- DropIndex
DROP INDEX "User_google_id_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "virtual_balance";

-- DropTable
DROP TABLE "Stock";

-- DropTable
DROP TABLE "StockPrice";

-- DropTable
DROP TABLE "TradeTransaction";

-- DropTable
DROP TABLE "UserPortfolio";

-- DropEnum
DROP TYPE "TradeType";

-- CreateTable
CREATE TABLE "GameRoom" (
    "room_code" TEXT NOT NULL,
    "host_id" UUID NOT NULL,
    "room_size" "GameRoomSize" NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "round" INTEGER NOT NULL DEFAULT 0,
    "phase_ends_at" TIMESTAMP(3),
    "discussion_seconds" INTEGER NOT NULL DEFAULT 30,
    "eliminated_this_round" TEXT,
    "winner" "GameWinner",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("room_code")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "room_code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GameRole",
    "status" "PlayerStatus" NOT NULL DEFAULT 'ALIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameVote" (
    "id" TEXT NOT NULL,
    "room_code" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "voter_id" TEXT NOT NULL,
    "target_id" TEXT,
    "vote_type" "VoteType" NOT NULL DEFAULT 'DAY_LYNCH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameRoom_status_idx" ON "GameRoom"("status");

-- CreateIndex
CREATE INDEX "GameRoom_status_room_size_idx" ON "GameRoom"("status", "room_size");

-- CreateIndex
CREATE INDEX "GamePlayer_room_code_idx" ON "GamePlayer"("room_code");

-- CreateIndex
CREATE INDEX "GamePlayer_room_code_status_idx" ON "GamePlayer"("room_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_room_code_user_id_key" ON "GamePlayer"("room_code", "user_id");

-- CreateIndex
CREATE INDEX "GameVote_room_code_round_idx" ON "GameVote"("room_code", "round");

-- CreateIndex
CREATE INDEX "GameVote_room_code_vote_type_idx" ON "GameVote"("room_code", "vote_type");

-- CreateIndex
CREATE INDEX "GameVote_voter_id_idx" ON "GameVote"("voter_id");

-- CreateIndex
CREATE INDEX "GameVote_target_id_idx" ON "GameVote"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "GameVote_room_code_round_voter_id_vote_type_key" ON "GameVote"("room_code", "round", "voter_id", "vote_type");

-- CreateIndex
CREATE UNIQUE INDEX "User_google_id_key" ON "User"("google_id");

-- AddForeignKey
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "GameRoom"("room_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVote" ADD CONSTRAINT "GameVote_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "GameRoom"("room_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVote" ADD CONSTRAINT "GameVote_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "GamePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVote" ADD CONSTRAINT "GameVote_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "GamePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
