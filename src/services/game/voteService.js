import prisma from "../../config/prisma.js";

// ─── VOTE SUBMISSION ──────────────────────────────────────────────────────────

/**
 * Upserts a vote for a player in a given round.
 * Enforces:
 *   - voter must be ALIVE
 *   - target must be ALIVE (if target is required)
 *   - Stores optional target_meta (for hitman, bounty hunter, reporter)
 */
export async function submitVote({
  roomCode,
  round,
  voterId,
  targetId,
  voteType,
  targetMeta,
}) {
  // Validate voter is alive in this room
  const voter = await prisma.gamePlayer.findUnique({
    where: { room_code_user_id: { room_code: roomCode, user_id: voterId } },
    select: { id: true, status: true },
  });
  if (!voter)
    throw Object.assign(new Error("Player not in room"), { status: 404 });
  if (voter.status !== "ALIVE")
    throw Object.assign(new Error("Eliminated players cannot vote"), {
      status: 403,
    });

  // Resolve target's internal id (if provided)
  let resolvedTargetId = null;
  if (targetId) {
    const target = await prisma.gamePlayer.findUnique({
      where: { room_code_user_id: { room_code: roomCode, user_id: targetId } },
      select: { id: true, status: true },
    });
    if (!target)
      throw Object.assign(new Error("Target not in room"), { status: 404 });
    if (target.status !== "ALIVE")
      throw Object.assign(new Error("Cannot target an eliminated player"), {
        status: 400,
      });
    resolvedTargetId = target.id;
  }

  await prisma.gameVote.upsert({
    where: {
      room_code_round_voter_id_vote_type: {
        room_code: roomCode,
        round,
        voter_id: voter.id,
        vote_type: voteType,
      },
    },
    create: {
      room_code: roomCode,
      round,
      voter_id: voter.id,
      target_id: resolvedTargetId,
      vote_type: voteType,
      target_meta: targetMeta ?? undefined,
    },
    update: {
      target_id: resolvedTargetId,
      target_meta: targetMeta ?? undefined,
    },
  });
}

// ─── VOTE TALLYING ────────────────────────────────────────────────────────────

/**
 * Returns tally of DAY_LYNCH votes as { playerId → count }.
 */
export async function tallyDayVotes(roomCode, round) {
  const votes = await prisma.gameVote.findMany({
    where: {
      room_code: roomCode,
      round,
      vote_type: "DAY_LYNCH",
      target_id: { not: null },
    },
    select: { target_id: true },
  });

  const tally = {};
  for (const { target_id } of votes) {
    tally[target_id] = (tally[target_id] || 0) + 1;
  }
  return tally;
}

/**
 * Returns the player id with the most DAY_LYNCH votes.
 * Returns null on a tie (no elimination).
 */
export function findLynchTarget(tally) {
  const entries = Object.entries(tally);
  if (entries.length === 0) return null;

  entries.sort(([, a], [, b]) => b - a);
  const [topId, topCount] = entries[0];
  const isTie = entries.length > 1 && entries[1][1] === topCount;
  return isTie ? null : topId;
}

// ─── NIGHT ACTION QUERIES ─────────────────────────────────────────────────────

/**
 * Returns the MAFIA_TARGET player id for this night (majority or first pick).
 */
export async function getMafiaTarget(roomCode, round) {
  const votes = await prisma.gameVote.findMany({
    where: {
      room_code: roomCode,
      round,
      vote_type: "MAFIA_TARGET",
      target_id: { not: null },
    },
    select: { target_id: true },
  });

  if (votes.length === 0) return null;

  const tally = {};
  for (const { target_id } of votes) {
    tally[target_id] = (tally[target_id] || 0) + 1;
  }
  const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] ?? null;
}

/**
 * Returns the player id chosen by DOC_SAVE.
 */
export async function getDoctorSave(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "DOC_SAVE",
      target_id: { not: null },
    },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}

/**
 * Returns the player id chosen by NURSE_ACTION.
 */
export async function getNurseAction(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "NURSE_ACTION",
      target_id: { not: null },
    },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}

/**
 * Returns the Hitman's double-target data from target_meta.
 * Format: { targets: [id1, id2], roles: ["DOCTOR", "NURSE"] }
 */
export async function getHitmanTarget(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "HITMAN_TARGET",
    },
    select: { target_meta: true },
  });

  if (!vote?.target_meta) return null;

  const meta =
    typeof vote.target_meta === "string"
      ? JSON.parse(vote.target_meta)
      : vote.target_meta;
  return meta;
}

/**
 * Returns the Bounty Hunter's revenge shot target for this round.
 */
export async function getBountyHunterShot(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "BOUNTY_HUNTER_SHOT",
      target_id: { not: null },
    },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}

/**
 * Returns the Reporter's expose target for this round.
 */
export async function getReporterExpose(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "REPORTER_EXPOSE",
      target_id: { not: null },
    },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}

/**
 * Returns the Cop's investigation target for this round.
 */
export async function getCopInvestigation(roomCode, round) {
  const vote = await prisma.gameVote.findFirst({
    where: {
      room_code: roomCode,
      round,
      vote_type: "COP_INVESTIGATE",
      target_id: { not: null },
    },
    select: { target_id: true },
  });
  return vote?.target_id ?? null;
}
