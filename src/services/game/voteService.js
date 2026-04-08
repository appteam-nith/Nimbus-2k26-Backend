import prisma from "../../config/prisma.js";

const REQUIRED_ROLE_BY_VOTE_TYPE = {
  DAY_LYNCH: null,
  MAFIA_TARGET: "MAFIA",
  DOC_SAVE: "DOCTOR",
  COP_INVESTIGATE: "COP",
  NURSE_ACTION: "NURSE",
  HITMAN_TARGET: "HITMAN",
  BOUNTY_HUNTER_VIP: "BOUNTY_HUNTER",
  BOUNTY_HUNTER_SHOT: "BOUNTY_HUNTER",
  REPORTER_EXPOSE: "REPORTER",
};

const SINGLETON_VOTE_TYPES = new Set([
  "MAFIA_TARGET",
  "DOC_SAVE",
  "COP_INVESTIGATE",
  "NURSE_ACTION",
  "HITMAN_TARGET",
  "BOUNTY_HUNTER_VIP",
  "BOUNTY_HUNTER_SHOT",
  "REPORTER_EXPOSE",
]);

const HITMAN_ROLE_GUESSES = new Set([
  "MAFIA",
  "MAFIA_HELPER",
  "HITMAN",
  "CITIZEN",
  "DOCTOR",
  "COP",
  "NURSE",
  "BOUNTY_HUNTER",
  "PROPHET",
  "REPORTER",
]);

function parseTargetMeta(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function parseStateMeta(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeHitmanMeta(meta) {
  const parsed = parseTargetMeta(meta);
  if (!parsed || typeof parsed !== "object") return null;

  const targets = parsed.targets;
  const roles = parsed.roles;

  if (!Array.isArray(targets) || !Array.isArray(roles)) return null;
  if (targets.length !== 2 || roles.length !== 2) return null;

  const normalizedTargets = targets.map((target) =>
    typeof target === "string" ? target.trim() : null
  );
  if (normalizedTargets.some((target) => !target)) return null;
  if (new Set(normalizedTargets).size !== 2) return null;

  const normalizedRoles = roles.map((role) =>
    typeof role === "string" ? role.trim().toUpperCase() : null
  );
  if (normalizedRoles.some((role) => !HITMAN_ROLE_GUESSES.has(role))) {
    return null;
  }

  return {
    targets: normalizedTargets,
    roles: normalizedRoles,
  };
}

async function getLatestVote(roomCode, round, voteType, select, requireTarget = false) {
  const where = {
    room_code: roomCode,
    round,
    vote_type: voteType,
  };
  if (requireTarget) {
    where.target_id = { not: null };
  }

  return prisma.gameVote.findFirst({
    where,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select,
  });
}

async function getLatestTargetVote(roomCode, round, voteType) {
  const vote = await getLatestVote(
    roomCode,
    round,
    voteType,
    { target_id: true },
    true
  );
  return vote?.target_id ?? null;
}

// --- VOTE SUBMISSION ---------------------------------------------------------

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
  let normalizedTargetMeta = targetMeta ?? null;

  // Validate voter is alive in this room.
  const voter = await prisma.gamePlayer.findUnique({
    where: { room_code_user_id: { room_code: roomCode, user_id: voterId } },
    select: { id: true, status: true, role: true },
  });
  if (!voter)
    throw Object.assign(new Error("Player not in room"), { status: 404 });
  if (voter.status !== "ALIVE")
    throw Object.assign(new Error("Eliminated players cannot vote"), {
      status: 403,
    });

  const requiredRole = REQUIRED_ROLE_BY_VOTE_TYPE[voteType];
  if (requiredRole && voter.role !== requiredRole) {
    throw Object.assign(new Error(`Only ${requiredRole} can cast ${voteType}`), {
      status: 403,
    });
  }

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

  // Defensive check: hitman cannot include self in either selected target.
  if (voteType === "HITMAN_TARGET") {
    // Parse and validate structure first
    const validatedMeta = normalizeHitmanMeta(targetMeta);
    if (!validatedMeta) {
      throw Object.assign(
        new Error(
          "HITMAN_TARGET requires target_meta with 2 distinct targets and 2 valid roles"
        ),
        { status: 400 }
      );
    }

    // Normalize targets to `user_id` only to avoid id/user_id mismatches
    const normalizedTargets = [];
    for (const rawTarget of validatedMeta.targets) {
      const player = await prisma.gamePlayer.findFirst({
        where: {
          room_code: roomCode,
          OR: [{ id: rawTarget }, { user_id: rawTarget }],
        },
        select: { id: true, user_id: true, status: true },
      });

      if (!player) {
        throw Object.assign(new Error("Hitman target not in room"), {
          status: 404,
        });
      }

      if (player.status !== "ALIVE") {
        throw Object.assign(new Error("Cannot target an eliminated player"), {
          status: 400,
        });
      }

      normalizedTargets.push(player.user_id);
    }

    // Prevent self-targeting: compare against voter's user_id
    if (normalizedTargets.includes(voterId)) {
      throw Object.assign(new Error("Hitman cannot target self"), {
        status: 400,
      });
    }

    normalizedTargetMeta = {
      targets: normalizedTargets,
      roles: validatedMeta.roles,
    };
  }

  if (SINGLETON_VOTE_TYPES.has(voteType)) {
    // Shared-row model for singleton actions:
    // only one row per (room, round, vote_type), latest submit overwrites.
    await prisma.$transaction(async (tx) => {
      // Acquire an advisory transaction-scoped lock for this (room, round, vote_type)
      // This serializes singleton action submissions without locking the entire room row.
      const lockKey = `${roomCode}:${round}:${voteType}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

      // Read room metadata under the same transaction for atomic action guards.
      await tx.$queryRaw`
        SELECT room_code
        FROM "GameRoom"
        WHERE room_code = ${roomCode}
        FOR UPDATE
      `;

      const room = await tx.gameRoom.findUnique({
        where: { room_code: roomCode },
        select: { state_meta: true },
      });
      const roomMeta = parseStateMeta(room?.state_meta);

      if (voteType === "HITMAN_TARGET" && roomMeta.hitman_resolved === true) {
        throw Object.assign(
          new Error("Hitman action already resolved for this night"),
          { status: 409 }
        );
      }

      if (voteType === "REPORTER_EXPOSE" && roomMeta.reporter_used === true) {
        throw Object.assign(
          new Error("Reporter ability has already been used this game"),
          { status: 409 }
        );
      }

      const existing = await tx.gameVote.findFirst({
        where: {
          room_code: roomCode,
          round,
          vote_type: voteType,
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: { id: true },
      });

      if (existing) {
        await tx.gameVote.update({
          where: { id: existing.id },
          data: {
            voter_id: voter.id,
            target_id: resolvedTargetId,
            target_meta: normalizedTargetMeta,
          },
        });

        // Defensive cleanup of any duplicates
        await tx.gameVote.deleteMany({
          where: {
            room_code: roomCode,
            round,
            vote_type: voteType,
            id: { not: existing.id },
          },
        });

        if (voteType === "REPORTER_EXPOSE") {
          await tx.gameRoom.update({
            where: { room_code: roomCode },
            data: {
              state_meta: {
                ...roomMeta,
                reporter_used: true,
              },
            },
          });
        }
        return;
      }

      await tx.gameVote.create({
        data: {
          room_code: roomCode,
          round,
          voter_id: voter.id,
          target_id: resolvedTargetId,
          vote_type: voteType,
          target_meta: normalizedTargetMeta,
        },
      });

      if (voteType === "REPORTER_EXPOSE") {
        await tx.gameRoom.update({
          where: { room_code: roomCode },
          data: {
            state_meta: {
              ...roomMeta,
              reporter_used: true,
            },
          },
        });
      }
    });

    return;
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
      target_meta: normalizedTargetMeta,
    },
    update: {
      target_id: resolvedTargetId,
      target_meta: normalizedTargetMeta,
    },
  });
}

// --- VOTE TALLYING -----------------------------------------------------------

/**
 * Returns tally of DAY_LYNCH votes as { playerId -> count }.
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

// --- NIGHT ACTION QUERIES ----------------------------------------------------

/**
 * Returns the MAFIA_TARGET player id for this night.
 * Model: shared mafia vote, last change wins.
 * Also rejects rows where the voter is not actually MAFIA.
 */
export async function getMafiaTarget(roomCode, round) {
  const vote = await getLatestVote(
    roomCode,
    round,
    "MAFIA_TARGET",
    { target_id: true, voter: { select: { role: true } } },
    true
  );

  if (!vote) return null;
  return vote.voter?.role === "MAFIA" ? vote.target_id : null;
}

/**
 * Returns the player id chosen by DOC_SAVE.
 */
export async function getDoctorSave(roomCode, round) {
  return getLatestTargetVote(roomCode, round, "DOC_SAVE");
}

/**
 * Returns the player id chosen by NURSE_ACTION.
 */
export async function getNurseAction(roomCode, round) {
  return getLatestTargetVote(roomCode, round, "NURSE_ACTION");
}

/**
 * Returns the Hitman's double-target data from target_meta.
 * Format: { targets: [id1, id2], roles: ["DOCTOR", "NURSE"] }
 */
export async function getHitmanTarget(roomCode, round) {
  const vote = await getLatestVote(roomCode, round, "HITMAN_TARGET", {
    target_meta: true,
  });

  if (!vote?.target_meta) return null;
  return normalizeHitmanMeta(vote.target_meta);
}

/**
 * Returns the Bounty Hunter's revenge shot target for this round.
 */
export async function getBountyHunterShot(roomCode, round) {
  return getLatestTargetVote(roomCode, round, "BOUNTY_HUNTER_SHOT");
}

/**
 * Returns the Reporter's expose target for this round.
 */
export async function getReporterExpose(roomCode, round) {
  return getLatestTargetVote(roomCode, round, "REPORTER_EXPOSE");
}

/**
 * Returns the Cop's investigation target for this round.
 */
export async function getCopInvestigation(roomCode, round) {
  return getLatestTargetVote(roomCode, round, "COP_INVESTIGATE");
}
