/*
  Warnings:

  - Added the required column `club_type` to the `Club` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClubType" AS ENUM ('DEPARTMENTAL', 'CORE');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "club_type" "ClubType";

-- Update existing clubs to CORE type
UPDATE "Club" SET "club_type" = 'CORE';

-- Make club_type required
ALTER TABLE "Club" ALTER COLUMN "club_type" SET NOT NULL;

-- CreateTable
CREATE TABLE "CoreTeamMember" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "image_url" TEXT,
    "linkedin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoreTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "project_id" SERIAL NOT NULL,
    "project_name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "club_id" INTEGER NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "Project_club_id_idx" ON "Project"("club_id");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "Club"("club_id") ON DELETE CASCADE ON UPDATE CASCADE;
