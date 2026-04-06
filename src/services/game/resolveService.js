import prisma from "../../config/prisma.js";
import pusher from "../../config/pusher.js";
import {
  getMafiaTarget,
  getDoctorSave,
  getNurseAction,
  getHitmanTarget,
  getBountyHunterShot,
  getReporterExpose,
  tallyDayVotes,
  findLynchTarget,
} from "./voteService.js";

// ─── PHASE DURATIONS (ms) ─────────────────────────────────────────────────────
export const PHASE_DURATION = {
  NIGHT: 15_000,
  DISCUSSION: 30_000,
  VOTING: 10_000,
  REVEAL: 3_000,
};

// Hitman actions resolve 5s before end of night
const HITMAN_EARLY_MS = 5_000;

// ─── HELPERS: state_meta read/write ───────────────────────────────────────────

function getMeta(room) {
  if (!room.state_meta) return {};
  if (typeof room.state_meta === "string") return JSON.parse(room.state_meta);
  return room.state_meta;
}

async function setMeta(roomCode, patch) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    select: { state_meta: true },
  });
  const current = getMeta(room);
  const merged = { ...current, ...patch };
  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: { state_meta: merged },
  });
  return merged;
}

// ─── WIN CONDITION ────────────────────────────────────────────────────────────

/**
 * Checks whether the game has ended.
 *
 * Key rules:
 *   - Unmet Hitman counts as CITIZEN team (not mafia).
 *   - Met Hitman counts as MAFIA team.
 *   - Prophet alive → Mafia CANNOT win.
 *   - All Mafia + met Hitman dead → Citizens win.
 *
 * Returns "MAFIA" | "CITIZENS" | null.
 */
async function checkWinCondition(roomCode) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    select: { state_meta: true },
  });
  const meta = getMeta(room);
  const hitmanMetMafia = !!meta.hitman_met_mafia;

  const alive = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode, status: "ALIVE" },
    select: { role: true },
  });

  // Count mafia team (MAFIA always counts; HITMAN only if met)
  let mafiaCount = 0;
  let citizenCount = 0;
  let prophetAlive = false;

  for (const p of alive) {
    if (p.role === "MAFIA") {
      mafiaCount++;
    } else if (p.role === "HITMAN") {
      if (hitmanMetMafia) {
        mafiaCount++;
      } else {
        citizenCount++; // unmet hitman counts as citizen
      }
    } else {
      citizenCount++;
      if (p.role === "PROPHET") prophetAlive = true;
    }
  }

  // All mafia team dead → citizens win
  if (mafiaCount === 0) {
    // But also check: is there an unmet hitman alive? He's citizen-side but
    // citizens still need all MAFIA role holders dead. Unmet hitman is not a
    // traditional 'mafia' target. The spec says "Eliminate all Mafia and the Hitman".
    // So we actually need hitman dead too for citizens to win.
    const hitmanAlive = alive.some((p) => p.role === "HITMAN");
    if (!hitmanAlive) return "CITIZENS";
    // If hitman is alive but unmet, mafia team is 0 but hitman is still a threat.
    // Citizens win when ALL mafia + hitman are dead.
    // Wait — the spec says citizen win = "Eliminate all Mafia and the Hitman".
    // So even unmet hitman must die. Check:
    return null; // hitman still alive, game continues
  }

  // Prophet alive → Mafia cannot win
  if (prophetAlive) return null;

  // Mafia team >= citizen team → Mafia wins
  if (mafiaCount >= citizenCount) return "MAFIA";

  return null;
}

/**
 * Prophet Day-4 check — called when entering DISCUSSION.
 * If round >= 4 and Prophet is alive, Citizens win immediately.
 */
async function checkProphetWin(roomCode, round) {
  if (round < 4) return null;

  const prophet = await prisma.gamePlayer.findFirst({
    where: { room_code: roomCode, status: "ALIVE", role: "PROPHET" },
    select: { id: true },
  });

  return prophet ? "CITIZENS" : null;
}

// ─── HITMAN EARLY RESOLUTION (T-5s) ──────────────────────────────────────────

/**
 * Resolves the Hitman's double-kill attempt.
 *
 * Rules:
 *   - Hitman selects 2 targets + guesses 2 roles
 *   - If BOTH guesses are correct → both targets die (pierces doctor heal)
 *   - Cannot target/guess COP
 *   - Cannot kill Mafia team members
 *   - If one guess correctly identifies a MAFIA member →
 *     kill canceled, Hitman "meets mafia" permanently
 */
async function resolveHitmanEarly(room) {
  const { room_code, round } = room;

  const hitmanVote = await getHitmanTarget(room_code, round);
  if (!hitmanVote) return; // Hitman didn't act

  const { targets, roles } = hitmanVote;
  if (!targets || targets.length !== 2 || !roles || roles.length !== 2) return;

  // Fetch all alive players for lookups
  const alivePlayers = await prisma.gamePlayer.findMany({
    where: { room_code, status: "ALIVE" },
    select: { id: true, user_id: true, role: true },
  });
  const playerById = new Map(alivePlayers.map((p) => [p.id, p]));
  const playerByUserId = new Map(alivePlayers.map((p) => [p.user_id, p]));

  // Resolve each guess
  const earlyDeaths = [];
  let meetsMafia = false;

  for (let i = 0; i < 2; i++) {
    const targetId = targets[i]; // could be player.id or user_id
    const guessedRole = roles[i];

    // Find the target player (try by id first, then user_id)
    const target = playerById.get(targetId) || playerByUserId.get(targetId);
    if (!target) continue;

    const actualRole = target.role;

    // Cannot target COP
    if (actualRole === "COP") continue;

    // Check if guess identifies a MAFIA member
    if (actualRole === "MAFIA" && guessedRole === "MAFIA") {
      meetsMafia = true;
      break; // Kill canceled, hitman meets mafia
    }

    // Check if guess is correct
    if (guessedRole === actualRole) {
      // Cannot kill mafia team members
      if (["MAFIA", "HITMAN"].includes(actualRole)) continue;

      // Kill! Pierces doctor heal.
      await prisma.gamePlayer.update({
        where: { id: target.id },
        data: { status: "ELIMINATED" },
      });
      earlyDeaths.push({
        playerId: target.id,
        userId: target.user_id,
        role: actualRole,
        killedBy: "HITMAN",
      });
    }
  }

  // Store results in state_meta
  const metaPatch = {
    hitman_resolved: true,
    early_deaths: earlyDeaths,
  };

  if (meetsMafia) {
    metaPatch.hitman_met_mafia = true;
    metaPatch.early_deaths = []; // Kill canceled
  }

  await setMeta(room_code, metaPatch);

  // Broadcast hitman-strike
  await pusher.trigger(`game-${room_code}`, "hitman-strike", {
    round,
    deaths: earlyDeaths.map((d) => ({
      playerId: d.playerId,
      userId: d.userId,
      killedBy: "HITMAN",
    })),
    hitmanMetMafia: meetsMafia,
  });
}

// ─── FULL NIGHT RESOLUTION (T-0s) ───────────────────────────────────────────

/**
 * Resolves all night actions in strict order:
 *
 *   1. Bounty Hunter VIP tracking + revenge kill
 *   2. Nurse + Doctor combo
 *   3. Mafia kill vs Doctor heal
 *   4. Combine all deaths (hitman early + mafia + bounty hunter)
 *   5. Reporter result storage
 *   6. Prophet override (Day 4 check happens at DISCUSSION entry)
 *   7. Win condition
 *   8. Transition to DISCUSSION
 */
async function resolveNightEnd(room) {
  const { room_code, round, nurse_met_doctor } = room;
  const meta = getMeta(room);

  const alivePlayers = await prisma.gamePlayer.findMany({
    where: { room_code, status: "ALIVE" },
    select: { id: true, user_id: true, role: true },
  });
  const playerById = new Map(alivePlayers.map((p) => [p.id, p]));

  // Fetch all night actions
  const mafiaTargetId = await getMafiaTarget(room_code, round);
  const doctorSaveId = await getDoctorSave(room_code, round);
  const nurseActionId = await getNurseAction(room_code, round);

  const docPlayer = alivePlayers.find((p) => p.role === "DOCTOR") ?? null;
  const nursePlayer = alivePlayers.find((p) => p.role === "NURSE") ?? null;

  // ── 1. Bounty Hunter VIP + revenge ────────────────────────────────────────
  const allDeaths = [...(meta.early_deaths || [])]; // hitman kills from T-5s
  const earlyDeathIds = new Set(allDeaths.map((d) => d.playerId));

  let bountyKillUnlocked = !!meta.bounty_kill_unlocked;
  const bountyVipId = meta.bounty_vip_player_id || null;

  // Check if VIP was killed (by hitman early or will be killed by mafia)
  if (bountyVipId && !bountyKillUnlocked) {
    // Check hitman early deaths
    if (earlyDeathIds.has(bountyVipId)) {
      bountyKillUnlocked = true;
    }
    // We'll also check after mafia kill below
  }

  // ── 2. Nurse + Doctor combo ───────────────────────────────────────────────
  const safeIds = new Set();
  let nurseMeetsDocThisNight = false;

  // Doctor always protects whoever they save
  if (doctorSaveId) safeIds.add(doctorSaveId);

  // Nurse auto-shields Doctor every night once they've met
  if (nurse_met_doctor && docPlayer) {
    safeIds.add(docPlayer.id); // Nurse shields Doctor

    // Mutual protection: Doc saves Nurse AND Nurse already shields Doc
    if (nursePlayer && doctorSaveId === nursePlayer.id) {
      safeIds.add(nursePlayer.id);
      safeIds.add(docPlayer.id);
    }
  } else if (
    !nurse_met_doctor &&
    nurseActionId &&
    docPlayer &&
    nurseActionId === docPlayer.id
  ) {
    // Nurse investigates Doctor → they meet (shield from NEXT night)
    nurseMeetsDocThisNight = true;
  }

  // ── 3. Mafia kill vs Doctor heal ──────────────────────────────────────────
  let mafiaKill = null;
  if (mafiaTargetId && !safeIds.has(mafiaTargetId) && !earlyDeathIds.has(mafiaTargetId)) {
    // Target is not protected and not already dead from hitman
    await prisma.gamePlayer.update({
      where: { id: mafiaTargetId },
      data: { status: "ELIMINATED" },
    });
    const target = playerById.get(mafiaTargetId);
    mafiaKill = {
      playerId: mafiaTargetId,
      userId: target?.user_id,
      role: target?.role,
      killedBy: "MAFIA",
    };
    allDeaths.push(mafiaKill);
  }

  // Check if VIP was killed by mafia
  if (bountyVipId && !bountyKillUnlocked && mafiaKill?.playerId === bountyVipId) {
    bountyKillUnlocked = true;
  }

  // ── Bounty Hunter revenge kill ────────────────────────────────────────────
  let bountyKill = null;
  if (bountyKillUnlocked) {
    const bountyTargetId = await getBountyHunterShot(room_code, round);
    if (bountyTargetId && !earlyDeathIds.has(bountyTargetId)) {
      const bountyTarget = playerById.get(bountyTargetId);
      // BH kill pierces Doctor heal but NOT Nurse+Doc combo
      const nurseDocComboActive =
        nurse_met_doctor &&
        docPlayer &&
        nursePlayer &&
        doctorSaveId === nursePlayer.id &&
        bountyTargetId === docPlayer.id;

      if (!nurseDocComboActive) {
        // Check if already dead from mafia
        const alreadyDead = allDeaths.some((d) => d.playerId === bountyTargetId);
        if (!alreadyDead) {
          await prisma.gamePlayer.update({
            where: { id: bountyTargetId },
            data: { status: "ELIMINATED" },
          });
          bountyKill = {
            playerId: bountyTargetId,
            userId: bountyTarget?.user_id,
            role: bountyTarget?.role,
            killedBy: "BOUNTY_HUNTER",
          };
          allDeaths.push(bountyKill);
        }
      }
    }
  }

  // ── 4. Deaths are now combined in allDeaths ───────────────────────────────

  // ── 5. Reporter result ────────────────────────────────────────────────────
  let reporterResult = null;
  const reporterExposeId = await getReporterExpose(room_code, round);
  if (reporterExposeId) {
    const exposedPlayer = playerById.get(reporterExposeId);
    if (exposedPlayer) {
      // Find the reporter player
      const reporterPlayer = alivePlayers.find((p) => p.role === "REPORTER");
      const reporterSurvived = reporterPlayer && !allDeaths.some(
        (d) => d.playerId === reporterPlayer.id
      );
      reporterResult = {
        targetId: reporterExposeId,
        targetUserId: exposedPlayer.user_id,
        exposedRole: exposedPlayer.role,
        willBroadcast: !!reporterSurvived,
        reporterUserId: reporterPlayer?.user_id,
      };
    }
  }

  // ── 6. Persist state ──────────────────────────────────────────────────────
  const metaUpdates = {
    hitman_resolved: false,
    night_resolved: true,
    early_deaths: [],
    bounty_kill_unlocked: bountyKillUnlocked,
  };

  if (reporterResult?.willBroadcast) {
    metaUpdates.reporter_result = reporterResult;
    metaUpdates.reporter_used = true;
  }

  await setMeta(room_code, metaUpdates);

  if (nurseMeetsDocThisNight) {
    await prisma.gameRoom.update({
      where: { room_code },
      data: { nurse_met_doctor: true },
    });
  }

  // ── 7. Win condition ──────────────────────────────────────────────────────
  const winner = await checkWinCondition(room_code);
  if (winner) {
    await endGame(room_code, winner);
    return;
  }

  // ── 8. Transition to DISCUSSION ───────────────────────────────────────────
  // Check Prophet Day 4 win
  const prophetWin = await checkProphetWin(room_code, round);
  if (prophetWin) {
    await endGame(room_code, prophetWin);
    return;
  }

  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.DISCUSSION);
  await prisma.gameRoom.update({
    where: { room_code },
    data: { status: "DISCUSSION", phase_ends_at: phaseEndsAt },
  });

  await pusher.trigger(`game-${room_code}`, "phase-resolved", {
    phase: "DISCUSSION",
    round,
    deaths: allDeaths.map((d) => ({
      playerId: d.playerId,
      userId: d.userId,
      killedBy: d.killedBy,
    })),
    nurseMeetingHappened: nurseMeetsDocThisNight,
    reporterBroadcast: reporterResult?.willBroadcast
      ? {
          targetUserId: reporterResult.targetUserId,
          exposedRole: reporterResult.exposedRole,
        }
      : null,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

// ─── DISCUSSION → VOTING ──────────────────────────────────────────────────────

async function resolveDiscussion(room) {
  const { room_code, round } = room;

  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.VOTING);
  await prisma.gameRoom.update({
    where: { room_code },
    data: { status: "VOTING", phase_ends_at: phaseEndsAt },
  });

  await pusher.trigger(`game-${room_code}`, "phase-resolved", {
    phase: "VOTING",
    round,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

// ─── VOTING RESOLUTION ────────────────────────────────────────────────────────

async function resolveVoting(room) {
  const { room_code, round } = room;

  const tally = await tallyDayVotes(room_code, round);
  const lynchTargetId = findLynchTarget(tally);

  let eliminated = null;
  if (lynchTargetId) {
    await prisma.gamePlayer.update({
      where: { id: lynchTargetId },
      data: { status: "ELIMINATED" },
    });
    eliminated = lynchTargetId;

    await prisma.gameRoom.update({
      where: { room_code },
      data: { eliminated_this_round: lynchTargetId },
    });
  }

  // Check win
  const winner = await checkWinCondition(room_code);
  if (winner) {
    const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.REVEAL);
    await prisma.gameRoom.update({
      where: { room_code },
      data: { status: "REVEAL", phase_ends_at: phaseEndsAt },
    });
    await pusher.trigger(`game-${room_code}`, "phase-resolved", {
      phase: "REVEAL",
      round,
      eliminatedPlayerId: eliminated,
      phaseEndsAt: phaseEndsAt.toISOString(),
    });
    setTimeout(() => endGame(room_code, winner), PHASE_DURATION.REVEAL);
    return;
  }

  if (eliminated) {
    const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.REVEAL);
    await prisma.gameRoom.update({
      where: { room_code },
      data: { status: "REVEAL", phase_ends_at: phaseEndsAt },
    });
    await pusher.trigger(`game-${room_code}`, "phase-resolved", {
      phase: "REVEAL",
      round,
      eliminatedPlayerId: eliminated,
      phaseEndsAt: phaseEndsAt.toISOString(),
    });
    setTimeout(
      () => advanceToNight(room_code, round + 1),
      PHASE_DURATION.REVEAL
    );
  } else {
    await advanceToNight(room_code, round + 1);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function advanceToNight(roomCode, nextRound) {
  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.NIGHT);

  // Reset per-night flags, preserve persistent flags
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    select: { state_meta: true },
  });
  const meta = getMeta(room);
  const freshMeta = {
    ...meta,
    hitman_resolved: false,
    night_resolved: false,
    early_deaths: [],
  };

  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: {
      status: "NIGHT",
      round: nextRound,
      phase_ends_at: phaseEndsAt,
      eliminated_this_round: null,
      state_meta: freshMeta,
    },
  });

  await pusher.trigger(`game-${roomCode}`, "phase-resolved", {
    phase: "NIGHT",
    round: nextRound,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });
}

async function endGame(roomCode, winner) {
  const allPlayers = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode },
    include: { user: { select: { full_name: true } } },
  });

  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: { status: "ENDED", winner },
  });

  await pusher.trigger(`game-${roomCode}`, "game-ended", {
    winner,
    players: allPlayers.map((p) => ({
      userId: p.user_id,
      name: p.user.full_name,
      role: p.role,
      status: p.status,
    })),
  });
}

// ─── HEARTBEAT DISPATCHER ─────────────────────────────────────────────────────

/**
 * Called every second from the server heartbeat.
 *
 * Split timing for NIGHT rooms:
 *   - At T-5s: resolveHitmanEarly (if not already done)
 *   - At T-0s: resolveNightEnd (full resolution)
 *
 * Other phases resolve at T-0s as before.
 */
export async function resolveExpiredRooms() {
  const now = new Date();

  // ── Handle NIGHT rooms with split timing ──────────────────────────────────
  const nightRooms = await prisma.gameRoom.findMany({
    where: {
      status: "NIGHT",
      phase_ends_at: { not: null },
    },
  });

  for (const room of nightRooms) {
    try {
      const timeLeftMs = new Date(room.phase_ends_at) - now;
      const meta = getMeta(room);

      // T-5s: Hitman early resolution
      if (timeLeftMs <= HITMAN_EARLY_MS && !meta.hitman_resolved) {
        await resolveHitmanEarly(room);
      }

      // T-0s: Full night resolution
      if (timeLeftMs <= 0 && !meta.night_resolved) {
        // Lock by clearing phase_ends_at
        await prisma.gameRoom.update({
          where: { room_code: room.room_code },
          data: { phase_ends_at: null },
        });
        await resolveNightEnd(room);
      }
    } catch (err) {
      console.error(
        `[heartbeat] Failed to resolve NIGHT room ${room.room_code}:`,
        err.message
      );
    }
  }

  // ── Handle DISCUSSION and VOTING rooms (unchanged) ────────────────────────
  const otherExpired = await prisma.gameRoom.findMany({
    where: {
      status: { in: ["DISCUSSION", "VOTING"] },
      phase_ends_at: { lte: now },
    },
  });

  for (const room of otherExpired) {
    try {
      await prisma.gameRoom.update({
        where: { room_code: room.room_code },
        data: { phase_ends_at: null },
      });

      if (room.status === "DISCUSSION") await resolveDiscussion(room);
      else if (room.status === "VOTING") await resolveVoting(room);
    } catch (err) {
      console.error(
        `[heartbeat] Failed to resolve room ${room.room_code}:`,
        err.message
      );
    }
  }
}
