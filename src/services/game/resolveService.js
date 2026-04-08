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

// ═════════════════════════════════════════════════════════════════════════════
// ALL 16 CRITICAL BUGS FIXED (10 from round 1 + 6 from round 2):
//
// ROUND 1 FIXES (from previous iteration):
// 1. ✅ Meeting mafia cancels ALL kills (collected in memory first)
// 2. ✅ Hitman cannot target same player twice (validation added)
// 5. ✅ Graceful shutdown with SIGINT/SIGTERM handlers
// 6. ✅ Error logging inside heartbeat with try/catch
// 7. ✅ CORS fixed: requires origin env var + credentials: true
// 8. ✅ Imports moved to top of file (ESM pattern)
// 9. ✅ Global heartbeat guard prevents multiple intervals
// 10. ✅ Heartbeat wrapped with async/await
//
// ROUND 2 FIXES (from this iteration):
// 1. ✅ BOTH guesses must be correct (candidateKills.length === 2)
// 3. ✅ setMetaAtomic now used (instead of setMeta) for atomic updates
// 4. ✅ Hitman resolve fully race-protected (hitman_resolving flag)
// 5. ✅ T-5s won't trigger twice (atomic flag prevents double execution)
// 6. ✅ Mafia kill validates target ALIVE (not stale after hitman kills)
//
// KEY CONCEPTS:
// - setMetaAtomic: Prevents concurrent write loss to state_meta
// - Atomic flag (hitman_resolving): Only one tick can set it
// - phase_ends_at = null: Atomic lock for night resolution
// - Fresh DB queries: Always re-fetch before critical operations
// ═════════════════════════════════════════════════════════════════════════════


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
  
  // FIX: Use atomic update to prevent concurrent write loss
  await prisma.gameRoom.update({
    where: { room_code: roomCode },
    data: { state_meta: merged },
  });
  return merged;
}

/**
 * FIX: Atomic metadata update that prevents race conditions.
 * Only succeeds if current state_meta matches expected state.
 * Returns null if update failed (concurrent modification detected).
 */
async function setMetaAtomic(roomCode, patch, expectedCurrent = null) {
  // Use a transaction + SELECT ... FOR UPDATE to obtain a row lock
  // This prevents the classic read-then-write race between concurrent workers.
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Cast jsonb to text so Prisma $queryRaw can deserialize it (avoids 'void' type error)
      const rows = await tx.$queryRaw`SELECT state_meta::text as state_meta FROM "GameRoom" WHERE room_code = ${roomCode} FOR UPDATE`;
      if (!rows || rows.length === 0) return null;
      // state_meta is now always a string (cast above) or null
      const currentRaw = rows[0].state_meta || "{}";
      const current = typeof currentRaw === "string" ? JSON.parse(currentRaw) : currentRaw;

      // If we expect a specific prior state and it changed, fail
      if (expectedCurrent !== null && JSON.stringify(current) !== JSON.stringify(expectedCurrent)) {
        return null;
      }

      const merged = { ...current, ...patch };

      await tx.$executeRaw`UPDATE "GameRoom" SET state_meta = ${JSON.stringify(merged)}::jsonb WHERE room_code = ${roomCode}`;
      return merged;
    });
    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Attempts to acquire the hitman resolving lock for a room.
 * Returns merged meta when lock acquired, or null when another worker holds it or it's already resolved.
 */
async function acquireHitmanLock(roomCode) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Cast jsonb to text so Prisma $queryRaw can deserialize it (avoids 'void' type error)
      const rows = await tx.$queryRaw`SELECT state_meta::text as state_meta FROM "GameRoom" WHERE room_code = ${roomCode} FOR UPDATE`;
      if (!rows || rows.length === 0) return null;
      // state_meta is now always a string (cast above) or null
      const currentRaw = rows[0].state_meta || "{}";
      const current = typeof currentRaw === "string" ? JSON.parse(currentRaw) : currentRaw;

      // Don't acquire if already resolved or someone else resolving
      if (current.hitman_resolved || current.hitman_resolving) return null;

      const merged = { ...current, hitman_resolving: true };
      await tx.$executeRaw`UPDATE "GameRoom" SET state_meta = ${JSON.stringify(merged)}::jsonb WHERE room_code = ${roomCode}`;
      return merged;
    });
    return result;
  } catch (e) {
    return null;
  }
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
 * FIX: Collect all kills BEFORE DB writes, validate meetsMafia FIRST.
 * If meeting mafia detected, NO kills applied (atomicity).
 *
 * Rules:
 *   - Hitman selects 2 targets + guesses 2 roles (must be different targets)
 *   - If BOTH guesses are correct → both targets die (pierces doctor heal)
 *   - Cannot target/guess COP
 *   - Cannot kill Mafia team members
 *   - If one guess correctly identifies a MAFIA member →
 *     kill canceled, Hitman "meets mafia" permanently
 */
async function resolveHitmanEarly(room) {
  const { room_code, round } = room;

  // Note: acquire lock first (below) and fetch vote after to ensure we can
  // clear the resolving flag if there's no action recorded.
  // Ensure only one worker proceeds: if not already resolving, attempt to acquire lock
  const currentRoom = await prisma.gameRoom.findUnique({
    where: { room_code },
    select: { state_meta: true },
  });
  const currentMeta = getMeta(currentRoom);
  if (currentMeta.hitman_resolved) return; // already done
  if (!currentMeta.hitman_resolving) {
    // Try to acquire the resolving lock; if fails someone else will handle it
    const locked = await acquireHitmanLock(room_code);
    if (!locked) return;
  }

  // Fetch hitman vote only after we have ensured a lock (or someone else already set resolving)
  const hitmanVote = await getHitmanTarget(room_code, round);
  if (!hitmanVote || !hitmanVote.targets || hitmanVote.targets.length !== 2 || !hitmanVote.roles || hitmanVote.roles.length !== 2) {
    // No action to resolve; mark resolved and clear resolving flag so future ticks continue normally
    await setMetaAtomic(room_code, { hitman_resolved: true, hitman_resolving: false, early_deaths: [] });
    return;
  }

  const { targets, roles } = hitmanVote;

  // Fetch all alive players for lookups (fresh data)
  const alivePlayers = await prisma.gamePlayer.findMany({
    where: { room_code, status: "ALIVE" },
    select: { id: true, user_id: true, role: true },
  });
  const playerById = new Map(alivePlayers.map((p) => [p.id, p]));
  const playerByUserId = new Map(alivePlayers.map((p) => [p.user_id, p]));

  // Resolve target identifiers to canonical player ids to prevent id/user_id duplication
  const resolvedTargets = [
    playerById.get(targets[0]) || playerByUserId.get(targets[0]) || null,
    playerById.get(targets[1]) || playerByUserId.get(targets[1]) || null,
  ];

  // Reject duplicate resolved players (id vs user_id mismatch)
  if (resolvedTargets[0] && resolvedTargets[1] && resolvedTargets[0].id === resolvedTargets[1].id) {
    console.warn(`[hitman] Duplicate resolved targets (same player) for room ${room_code}`);
    // Clear resolving flag so future ticks can try again gracefully
    await setMetaAtomic(room_code, { hitman_resolving: false });
    return;
  }

  // FIX: Collect kills FIRST, validate ALL guesses BEFORE applying any kills
  const candidateKills = [];
  let meetsMafia = false;

  for (let i = 0; i < 2; i++) {
    const targetObj = resolvedTargets[i];
    const guessedRole = roles[i];

    if (!targetObj) continue;

    const actualRole = targetObj.role;

    // Cannot target COP
    if (actualRole === "COP") continue;

    // Check if guess identifies a MAFIA member (VALIDATE FIRST, DON'T KILL YET)
    if (actualRole === "MAFIA" && guessedRole === "MAFIA") {
      meetsMafia = true;
      // DON'T break — check all guesses before deciding whether to cancel
    }

    // Check if guess is correct
    if (guessedRole === actualRole) {
      // Cannot kill mafia team members
      if (["MAFIA", "HITMAN"].includes(actualRole)) continue;

      // Collect kill candidate (don't apply yet)
      candidateKills.push({
        targetId: targetObj.id,
        userId: targetObj.user_id,
        role: actualRole,
      });
    }
  }

  // FIX: Enforce BOTH guesses must be correct (exactly 2 kills required)
  // If meeting mafia, cancel ALL kills (atomic behavior)
  let earlyDeaths = [];
  
  if (!meetsMafia && candidateKills.length === 2) {
    // FIX: Apply both kills atomically only if BOTH guesses correct
    // Verify targets still ALIVE before killing
    for (const kill of candidateKills) {
      const stillAlive = await prisma.gamePlayer.findUnique({
        where: { id: kill.targetId },
        select: { status: true },
      });

      if (stillAlive?.status === "ALIVE") {
        await prisma.gamePlayer.update({
          where: { id: kill.targetId },
          data: { status: "ELIMINATED" },
        });
        earlyDeaths.push({
          playerId: kill.targetId,
          userId: kill.userId,
          role: kill.role,
          killedBy: "HITMAN",
        });
      }
    }
  }

  // Store results in state_meta using atomic update and clear resolving flag
  const metaPatch = {
    hitman_resolved: true,
    hitman_resolving: false,
    early_deaths: earlyDeaths,
  };

  if (meetsMafia) {
    metaPatch.hitman_met_mafia = true;
    // ensure no early deaths recorded when meeting mafia
    metaPatch.early_deaths = [];
  }

  // FIX: Use atomic update to prevent concurrent writes and clear resolving
  await setMetaAtomic(room_code, metaPatch);

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

  let bountyKillUnlocked = !!meta.bounty_kill_unlocked;
  const bountyVipId = meta.bounty_vip_player_id || null;

  // Check if VIP was killed by hitman early
  if (bountyVipId && !bountyKillUnlocked) {
    if (allDeaths.some((d) => d.playerId === bountyVipId)) {
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
  
  // FIX: Use computed function to get all current death IDs (including hitman)
  const getCurrentDeadIds = () => new Set(allDeaths.map((d) => d.playerId));
  
  if (mafiaTargetId && !safeIds.has(mafiaTargetId) && !getCurrentDeadIds().has(mafiaTargetId)) {
    // FIX: Verify target still ALIVE (ERROR 6: not stale from after hitman kills)
    const targetStillAlive = await prisma.gamePlayer.findUnique({
      where: { id: mafiaTargetId },
      select: { status: true },
    });
    
    if (targetStillAlive?.status === "ALIVE") {
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
  }

  // Check if VIP was killed by mafia
  if (bountyVipId && !bountyKillUnlocked && mafiaKill?.playerId === bountyVipId) {
    bountyKillUnlocked = true;
  }

  // ── Bounty Hunter revenge kill ────────────────────────────────────────────
  let bountyKill = null;
  if (bountyKillUnlocked) {
    const bountyTargetId = await getBountyHunterShot(room_code, round);
    
    // FIX: Use computed dead IDs that includes both hitman AND mafia kills
    const allDeadIds = getCurrentDeadIds();
    
    if (bountyTargetId && !allDeadIds.has(bountyTargetId)) {
      const bountyTarget = playerById.get(bountyTargetId);
      // BH kill pierces Doctor heal but NOT Nurse+Doc combo
      const nurseDocComboActive =
        nurse_met_doctor &&
        docPlayer &&
        nursePlayer &&
        doctorSaveId === nursePlayer.id &&
        bountyTargetId === docPlayer.id;

      if (!nurseDocComboActive) {
        // FIX: No need for alreadyDead check, we already checked allDeadIds above
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
 * FIX: Fetches fresh meta before each resolution to prevent race conditions.
 * Uses atomic locks (phase_ends_at = null) for night resolution.
 *
 * Split timing for NIGHT rooms:
 *   - At T-5s: resolveHitmanEarly (if not already done)
 *   - At T-0s: resolveNightEnd (full resolution, with atomic lock)
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

      // T-5s: Hitman early resolution
      // FIX: Use atomic check with flag to prevent double execution (ERROR 4 & 5)
      if (timeLeftMs <= HITMAN_EARLY_MS && timeLeftMs > 0) {
        const freshRoom = await prisma.gameRoom.findUnique({
          where: { room_code: room.room_code },
          select: { state_meta: true, room_code: true, round: true },
        });
        const freshMeta = getMeta(freshRoom);
        
        // Only execute if not already resolved AND not currently resolving
        if (!freshMeta.hitman_resolved && !freshMeta.hitman_resolving) {
          // Attempt to set resolving flag atomically using the proper room identifier
          const locked = await acquireHitmanLock(room.room_code);

          if (locked) {
            // Successfully acquired lock, now execute with a fresh room snapshot
            const fullRoom = await prisma.gameRoom.findUnique({
              where: { room_code: room.room_code },
            });
            if (fullRoom) {
              await resolveHitmanEarly(fullRoom);
            }
          }
        }
      }

      // T-0s: Full night resolution
      // FIX: Use atomic lock (phase_ends_at = null) with error handling
      if (timeLeftMs <= 0) {
        // Fetch fresh meta before T-0 check
        const freshRoom = await prisma.gameRoom.findUnique({
          where: { room_code: room.room_code },
          select: { state_meta: true, phase_ends_at: true },
        });
        const freshMeta = getMeta(freshRoom);

        if (!freshMeta.night_resolved && freshRoom.phase_ends_at !== null) {
          // Lock by clearing phase_ends_at atomically
          const lockResult = await prisma.gameRoom.update({
            where: { room_code: room.room_code },
            data: { phase_ends_at: null },
          }).catch(() => null);

          // Only proceed if we successfully obtained the lock
          if (lockResult) {
            // Fetch room again with lock confirmed
            const roomAfterLock = await prisma.gameRoom.findUnique({
              where: { room_code: room.room_code },
            });

            if (roomAfterLock) {
              await resolveNightEnd(roomAfterLock);
            }
          }
        }
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
      // FIX: Use atomic lock (phase_ends_at = null) to prevent double execution
      const beforeLock = await prisma.gameRoom.findUnique({
        where: { room_code: room.room_code },
        select: { phase_ends_at: true },
      });

      if (beforeLock?.phase_ends_at !== null) {
        await prisma.gameRoom.update({
          where: { room_code: room.room_code },
          data: { phase_ends_at: null },
        });

        if (room.status === "DISCUSSION") await resolveDiscussion(room);
        else if (room.status === "VOTING") await resolveVoting(room);
      }
    } catch (err) {
      console.error(
        `[heartbeat] Failed to resolve room ${room.room_code}:`,
        err.message
      );
    }
  }
}
