import prisma from "../config/prisma.js";
import pusher from "../config/pusher.js";
import {
  createRoom,
  joinRoom,
  getRoomState,
} from "../services/game/roomService.js";
import { startGame } from "../services/game/gameService.js";
import { submitVote } from "../services/game/voteService.js";
import { PHASE_DURATION } from "../services/game/resolveService.js";

// ─── PHASE GUARD MAP ──────────────────────────────────────────────────────────
// Each vote_type is only valid in certain game phases
const VOTE_TYPE_PHASE = {
  DAY_LYNCH: "VOTING",
  MAFIA_TARGET: "NIGHT",
  DOC_SAVE: "NIGHT",
  COP_INVESTIGATE: "NIGHT",
  NURSE_ACTION: "NIGHT",
  HITMAN_TARGET: "NIGHT",
  BOUNTY_HUNTER_VIP: "NIGHT",
  BOUNTY_HUNTER_SHOT: "NIGHT",
  REPORTER_EXPOSE: "NIGHT",
};

// Which role is allowed to cast each vote type
const VOTE_TYPE_ROLE = {
  DAY_LYNCH: null, // anyone alive
  MAFIA_TARGET: "MAFIA",
  DOC_SAVE: "DOCTOR",
  COP_INVESTIGATE: "COP",
  NURSE_ACTION: "NURSE",
  HITMAN_TARGET: "HITMAN",
  BOUNTY_HUNTER_VIP: "BOUNTY_HUNTER",
  BOUNTY_HUNTER_SHOT: "BOUNTY_HUNTER",
  REPORTER_EXPOSE: "REPORTER",
};

// Hitman early lockout — actions lock at T-5s before night end
const HITMAN_LOCKOUT_MS = 5_000;

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

// ─── LIST OPEN ROOMS ─────────────────────────────────────────────────────────

export const handleListRooms = async (req, res) => {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rooms = await prisma.gameRoom.findMany({
      where: {
        status: "LOBBY",
        created_at: { gte: twoHoursAgo },
      },
      include: { _count: { select: { players: true } } },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    const list = rooms.map((r) => ({
      roomCode: r.room_code,
      roomSize: r.room_size,
      playerCount: r._count.players,
      maxPlayers: { FIVE: 5, EIGHT: 8, TWELVE: 12 }[r.room_size] ?? 5,
    }));

    return res.status(200).json({ rooms: list });
  } catch (err) {
    console.error("[listRooms]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────

export const handleCreateRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_size } = req.body;

    if (!["FIVE", "EIGHT", "TWELVE"].includes(room_size)) {
      return res
        .status(400)
        .json({ error: "room_size must be FIVE, EIGHT, or TWELVE" });
    }

    const code = await createRoom(userId, room_size);

    // Notify the specific room channel
    await pusher.trigger(`room-${code}`, "room-created", {
      roomCode: code,
      hostId: userId,
    });

    // Notify the global rooms browser channel
    await pusher.trigger("rooms", "room-opened", {
      roomCode: code,
      roomSize: room_size,
      playerCount: 1,
      maxPlayers: { FIVE: 5, EIGHT: 8, TWELVE: 12 }[room_size] ?? 5,
    });

    return res.status(201).json({ success: true, roomCode: code });
  } catch (err) {
    console.error("[createRoom]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────

export const handleJoinRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code } = req.body;

    if (!room_code)
      return res.status(400).json({ error: "room_code is required" });

    await joinRoom(room_code, userId);

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { full_name: true },
    });

    await pusher.trigger(`room-${room_code}`, "player-joined", {
      userId,
      name: user?.full_name,
    });

    // Update the global rooms browser with new player count
    const playerCount = await prisma.gamePlayer.count({
      where: { room_code: room_code },
    });
    const room = await prisma.gameRoom.findUnique({
      where: { room_code: room_code },
      select: { room_size: true },
    });
    if (room) {
      await pusher.trigger("rooms", "room-opened", {
        roomCode: room_code,
        roomSize: room.room_size,
        playerCount,
        maxPlayers: { FIVE: 5, EIGHT: 8, TWELVE: 12 }[room.room_size] ?? 5,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[joinRoom]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── LEAVE ROOM ───────────────────────────────────────────────────────────────

export const handleLeaveRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code } = req.body;

    if (!room_code)
      return res.status(400).json({ error: "room_code is required" });

    // Fetch room status + player name BEFORE leaving (records may be deleted after).
    const [roomSnapshot, playerSnapshot] = await Promise.all([
      prisma.gameRoom.findUnique({
        where: { room_code },
        select: { status: true },
      }),
      prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: userId } },
        include: { user: { select: { full_name: true } } },
      }),
    ]);
    const playerName = playerSnapshot?.user?.full_name ?? "A player";
    const wasActiveGame =
      roomSnapshot &&
      roomSnapshot.status !== "LOBBY" &&
      roomSnapshot.status !== "ENDED";

    const { leaveRoom } = await import("../services/game/roomService.js");
    const result = await leaveRoom(room_code, userId);

    if (result && result.deleted) {
      // Room fully deleted (empty lobby or last real player in dev-mode game).
      await pusher.trigger("rooms", "room-closed", { roomCode: room_code });
    } else if (result && !result.deleted) {
      // Lobby: notify the room-lobby channel.
      await pusher.trigger(`room-${room_code}`, "player-left", {
        userId,
        newHostId: result.newHostId,
      });

      // Active game: also notify the game channel so in-game screens can mark
      // the player as "left" and display a system chat message.
      if (wasActiveGame) {
        await pusher.trigger(`game-${room_code}`, "player-left", {
          userId,
          playerName,
        });
        await pusher.trigger(`game-${room_code}`, "chat-message", {
          userId: "system",
          name: "System",
          message: `${playerName} left the game`,
          channel: "global",
          timestamp: new Date().toISOString(),
          isSystem: true,
        });
      }

      // Update player count on the browse screen.
      const playerCount = await prisma.gamePlayer.count({
        where: { room_code: room_code },
      });
      const rm = await prisma.gameRoom.findUnique({
        where: { room_code: room_code },
        select: { room_size: true },
      });
      if (rm && playerCount > 0) {
        await pusher.trigger("rooms", "room-opened", {
          roomCode: room_code,
          roomSize: rm.room_size,
          playerCount,
          maxPlayers: { FIVE: 5, EIGHT: 8, TWELVE: 12 }[rm.room_size] ?? 5,
        });
      } else {
        await pusher.trigger("rooms", "room-closed", { roomCode: room_code });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[leaveRoom]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET ROOM STATE ───────────────────────────────────────────────────────────

export const handleGetRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { code } = req.params;

    const state = await getRoomState(code, userId);
    if (!state) return res.status(404).json({ error: "Room not found" });

    return res.status(200).json(state);
  } catch (err) {
    console.error("[getRoom]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─── START GAME ───────────────────────────────────────────────────────────────

export const handleStartGame = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code, dev_mode, dev_host_role } = req.body;

    if (!room_code)
      return res.status(400).json({ error: "room_code is required" });

    await startGame(room_code, userId, dev_mode, dev_host_role ?? null);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[startGame]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── VOTE / NIGHT ACTION ──────────────────────────────────────────────────────

export const handleVote = async (req, res) => {
  try {
    const voterId = req.user.userId;
    const { room_code, target_id, vote_type, target_meta } = req.body;

    if (!room_code || !vote_type) {
      return res
        .status(400)
        .json({ error: "room_code and vote_type are required" });
    }

    // Fetch room state
    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: {
        status: true,
        round: true,
        phase_ends_at: true,
        state_meta: true,
      },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // ── Phase guard ─────────────────────────────────────────────────────────
    const requiredPhase = VOTE_TYPE_PHASE[vote_type];
    if (!requiredPhase)
      return res.status(400).json({ error: `Unknown vote_type: ${vote_type}` });
    if (room.status !== requiredPhase) {
      return res.status(409).json({
        error: `${vote_type} is only valid during ${requiredPhase} phase (current: ${room.status})`,
      });
    }

    // ── Role guard ──────────────────────────────────────────────────────────
    const requiredRole = VOTE_TYPE_ROLE[vote_type];
    if (requiredRole) {
      const voterPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: voterId } },
        select: { role: true, status: true },
      });
      if (!voterPlayer)
        return res.status(404).json({ error: "Player not in room" });
      if (voterPlayer.status !== "ALIVE")
        return res.status(403).json({ error: "Eliminated players cannot act" });

      // MAFIA_TARGET: any MAFIA member can vote (not just one)
      if (requiredRole === "MAFIA") {
        if (voterPlayer.role !== "MAFIA") {
          return res
            .status(403)
            .json({ error: `Only MAFIA can cast ${vote_type}` });
        }
      } else if (voterPlayer.role !== requiredRole) {
        return res
          .status(403)
          .json({ error: `Only ${requiredRole} can cast ${vote_type}` });
      }
    }

    // ── Parse state_meta ────────────────────────────────────────────────────
    const meta = parseStateMeta(room.state_meta);

    // ── Hitman T-5s lockout ─────────────────────────────────────────────────
    if (vote_type === "HITMAN_TARGET") {
      if (meta.hitman_resolved === true) {
        return res.status(409).json({
          error: "Hitman action already resolved for this night",
        });
      }

      if (room.phase_ends_at) {
        const timeLeftMs = new Date(room.phase_ends_at) - Date.now();
        if (timeLeftMs <= HITMAN_LOCKOUT_MS) {
          return res.status(409).json({
            error: "Hitman actions are locked in the last 5 seconds of night",
          });
        }
      }
      // Validate target_meta format
      if (!target_meta?.targets || !target_meta?.roles) {
        return res.status(400).json({
          error:
            "HITMAN_TARGET requires target_meta with { targets: [id,id], roles: [role,role] }",
        });
      }
      if (target_meta.targets.length !== 2 || target_meta.roles.length !== 2) {
        return res.status(400).json({
          error: "Hitman must select exactly 2 targets and 2 roles",
        });
      }
      // Cannot target COP
      for (const tid of target_meta.targets) {
        const tp = await prisma.gamePlayer.findUnique({
          where: { room_code_user_id: { room_code, user_id: tid } },
          select: { role: true },
        });
        if (tp?.role === "COP") {
          return res
            .status(400)
            .json({ error: "Hitman cannot target the Cop" });
        }
      }
    }

    // ── Bounty Hunter VIP — Night 1 only ────────────────────────────────────
    if (vote_type === "BOUNTY_HUNTER_VIP") {
      if (room.round !== 1) {
        return res
          .status(409)
          .json({ error: "VIP selection is only allowed on Night 1" });
      }
    }

    // ── Bounty Hunter shot — only if kill unlocked ──────────────────────────
    if (vote_type === "BOUNTY_HUNTER_SHOT") {
      if (!meta.bounty_kill_unlocked) {
        return res.status(409).json({
          error:
            "Bounty Hunter kill is not yet unlocked (VIP must be killed first)",
        });
      }
    }

    // ── Reporter — once per game ────────────────────────────────────────────
    if (vote_type === "REPORTER_EXPOSE") {
      if (meta.reporter_used) {
        return res.status(409).json({
          error: "Reporter ability has already been used this game",
        });
      }
    }

    // ── Submit the vote ─────────────────────────────────────────────────────
    await submitVote({
      roomCode: room_code,
      round: room.round,
      voterId,
      targetId: target_id ?? null,
      voteType: vote_type,
      targetMeta: target_meta ?? null,
    });

    // ── Special: Bounty Hunter VIP — persist to state_meta ──────────────────
    if (vote_type === "BOUNTY_HUNTER_VIP" && target_id) {
      const vipPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: target_id } },
        select: { id: true },
      });
      if (vipPlayer) {
        const currentRoom = await prisma.gameRoom.findUnique({
          where: { room_code },
          select: { state_meta: true },
        });
        const currentMeta = currentRoom?.state_meta
          ? typeof currentRoom.state_meta === "string"
            ? JSON.parse(currentRoom.state_meta)
            : currentRoom.state_meta
          : {};
        await prisma.gameRoom.update({
          where: { room_code },
          data: {
            state_meta: { ...currentMeta, bounty_vip_player_id: vipPlayer.id },
          },
        });
      }
    }

    // ── Cop investigation — instant private result ──────────────────────────
    if (vote_type === "COP_INVESTIGATE" && target_id) {
      const targetPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: target_id } },
        select: { role: true },
      });

      let result;
      if (targetPlayer?.role === "HITMAN") {
        // "First check" rule:
        // - First time this Cop checks Hitman on N1/N2 => CITIZEN
        // - Any later check => HITMAN
        // - First check on N3+ => HITMAN
        result = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT room_code
            FROM "GameRoom"
            WHERE room_code = ${room_code}
            FOR UPDATE
          `;

          const lockedRoom = await tx.gameRoom.findUnique({
            where: { room_code },
            select: { round: true, state_meta: true },
          });

          const lockedMeta = parseStateMeta(lockedRoom?.state_meta);
          const checkedBy =
            lockedMeta.cop_checked_hitman_by &&
            typeof lockedMeta.cop_checked_hitman_by === "object" &&
            !Array.isArray(lockedMeta.cop_checked_hitman_by)
              ? { ...lockedMeta.cop_checked_hitman_by }
              : {};

          const alreadyChecked = checkedBy[voterId] === true;
          const effectiveRound = lockedRoom?.round ?? room.round;
          const computedResult =
            !alreadyChecked && effectiveRound <= 2 ? "CITIZEN" : "HITMAN";

          checkedBy[voterId] = true;

          await tx.gameRoom.update({
            where: { room_code },
            data: {
              state_meta: {
                ...lockedMeta,
                cop_checked_hitman_by: checkedBy,
              },
            },
          });

          return computedResult;
        });
      } else if (targetPlayer?.role === "MAFIA") {
        result = "MAFIA";
      } else {
        result = "CITIZEN";
      }

      await pusher.trigger(`private-${voterId}`, "investigation-result", {
        roomCode: room_code,
        round: room.round,
        targetUserId: target_id,
        result,
      });

      // Also return in HTTP response as belt-and-suspenders
      return res
        .status(200)
        .json({ success: true, investigation_result: result });
    }

    // ── Nurse action — instant private feedback ─────────────────────────────
    if (vote_type === "NURSE_ACTION" && target_id) {
      const targetPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: target_id } },
        select: { role: true },
      });

      const isDoctor = targetPlayer?.role === "DOCTOR";
      await pusher.trigger(`private-${voterId}`, "nurse-check-result", {
        roomCode: room_code,
        round: room.round,
        targetUserId: target_id,
        isDoctor,
      });
    }

    // ── Reporter expose — instant private result ────────────────────────────
    if (vote_type === "REPORTER_EXPOSE" && target_id) {
      const targetPlayer = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: target_id } },
        select: { role: true },
      });

      await pusher.trigger(`private-${voterId}`, "reporter-result", {
        roomCode: room_code,
        round: room.round,
        targetUserId: target_id,
        role: targetPlayer?.role,
      });

      // Also return in HTTP response
      return res
        .status(200)
        .json({ success: true, investigation_result: targetPlayer?.role });
    }

    // ── Broadcast vote-updated with tally (for DAY_LYNCH) ────────────────────
    const normalizedTargetId =
      typeof target_id === "string" && target_id.trim().length > 0
        ? target_id.trim()
        : null;
    const broadcastPayload = {
      voterId,
      voteType: vote_type,
      targetId: normalizedTargetId,
      isSkip: normalizedTargetId == null,
    };

    // Include vote tally for DAY_LYNCH so clients can show live vote counts
    if (vote_type === "DAY_LYNCH") {
      const { tallyDayVotes } = await import("../services/game/voteService.js");
      const tally = await tallyDayVotes(room_code, room.round);

      // Convert GamePlayer.id keys to user_id keys for frontend
      const playerIdToUserId = {};
      const allPlayers = await prisma.gamePlayer.findMany({
        where: { room_code },
        select: { id: true, user_id: true },
      });
      for (const p of allPlayers) {
        playerIdToUserId[p.id] = p.user_id;
      }
      const userTally = {};
      for (const [playerId, count] of Object.entries(tally)) {
        const uid = playerIdToUserId[playerId] || playerId;
        userTally[uid] = count;
      }
      broadcastPayload.tally = userTally;
    }

    await pusher.trigger(`game-${room_code}`, "vote-updated", broadcastPayload);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[vote]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── CHAT ─────────────────────────────────────────────────────────────────────

export const handleAdjustDayTime = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code, adjustment } = req.body;
    const parsedAdjustment = Number(adjustment);

    if (!room_code || ![-1, 0, 1].includes(parsedAdjustment)) {
      return res.status(400).json({
        error: "room_code and adjustment (-1, 0, 1) are required",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT room_code
        FROM "GameRoom"
        WHERE room_code = ${room_code}
        FOR UPDATE
      `;

      const room = await tx.gameRoom.findUnique({
        where: { room_code },
        select: { status: true, round: true, state_meta: true },
      });
      if (!room) {
        throw Object.assign(new Error("Room not found"), { status: 404 });
      }
      if (room.status !== "DISCUSSION") {
        throw Object.assign(
          new Error("Day time can only be adjusted during DISCUSSION"),
          { status: 409 },
        );
      }

      const me = await tx.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code, user_id: userId } },
        select: { status: true },
      });
      if (!me) {
        throw Object.assign(new Error("Player not in room"), { status: 404 });
      }
      if (me.status !== "ALIVE") {
        throw Object.assign(
          new Error("Eliminated players cannot adjust day time"),
          { status: 403 },
        );
      }

      const aliveCount = await tx.gamePlayer.count({
        where: { room_code, status: "ALIVE" },
      });
      if (aliveCount <= 0) {
        throw Object.assign(new Error("No alive players in room"), {
          status: 409,
        });
      }

      const meta = parseStateMeta(room.state_meta);
      const baseSeconds =
        typeof meta.discussion_base_seconds === "number" &&
        meta.discussion_base_seconds > 0
          ? meta.discussion_base_seconds
          : Math.floor(PHASE_DURATION.DISCUSSION / 1000);

      const isCurrentRound = meta.discussion_time_vote_round === room.round;
      const rawVotes =
        isCurrentRound &&
        meta.discussion_time_votes &&
        typeof meta.discussion_time_votes === "object" &&
        !Array.isArray(meta.discussion_time_votes)
          ? { ...meta.discussion_time_votes }
          : {};

      const votes = {};
      for (const [uid, value] of Object.entries(rawVotes)) {
        if (value === 1 || value === -1) votes[uid] = value;
      }

      if (parsedAdjustment === 0) {
        delete votes[userId];
      } else {
        votes[userId] = parsedAdjustment;
      }

      const deltaSeconds = Math.max(1, Math.round(baseSeconds / aliveCount));
      const netAdjustment = Object.values(votes).reduce(
        (sum, value) => sum + (value === 1 || value === -1 ? value : 0),
        0,
      );

      const startRaw = isCurrentRound ? meta.discussion_phase_started_at : null;
      const startMs = startRaw ? Date.parse(startRaw) : NaN;
      const discussionStartAt = Number.isFinite(startMs)
        ? new Date(startMs)
        : new Date();

      const phaseEndsAt = new Date(
        discussionStartAt.getTime() +
          (baseSeconds + netAdjustment * deltaSeconds) * 1000,
      );

      const nextMeta = {
        ...meta,
        discussion_base_seconds: baseSeconds,
        discussion_time_vote_round: room.round,
        discussion_phase_started_at: discussionStartAt.toISOString(),
        discussion_time_votes: votes,
      };

      await tx.gameRoom.update({
        where: { room_code },
        data: {
          phase_ends_at: phaseEndsAt,
          state_meta: nextMeta,
        },
      });

      const increaseVotes = Object.values(votes).filter(
        (value) => value === 1,
      ).length;
      const decreaseVotes = Object.values(votes).filter(
        (value) => value === -1,
      ).length;

      return {
        round: room.round,
        phaseEndsAt,
        adjustment: votes[userId] ?? 0,
        deltaSeconds,
        netAdjustment,
        aliveCount,
        increaseVotes,
        decreaseVotes,
      };
    });

    await pusher.trigger(`game-${room_code}`, "day-time-updated", {
      phase: "DISCUSSION",
      round: result.round,
      phaseEndsAt: result.phaseEndsAt.toISOString(),
      aliveCount: result.aliveCount,
      deltaSeconds: result.deltaSeconds,
      netAdjustment: result.netAdjustment,
      increaseVotes: result.increaseVotes,
      decreaseVotes: result.decreaseVotes,
    });

    // System message: broadcast who adjusted the time and in which direction.
    if (result.adjustment !== 0) {
      try {
        const userRecord = await prisma.user.findUnique({
          where: { user_id: userId },
          select: { full_name: true },
        });
        const playerName = userRecord?.full_name ?? "A player";
        const action = result.adjustment > 0 ? "extended" : "reduced";
        await pusher.trigger(`game-${room_code}`, "chat-message", {
          userId: "system",
          name: "System",
          message: `${playerName} ${action} the remaining time`,
          channel: "global",
          timestamp: new Date().toISOString(),
          isSystem: true,
        });
      } catch (sysErr) {
        console.error("[adjustDayTime:sysMsg]", sysErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      phaseEndsAt: result.phaseEndsAt.toISOString(),
      adjustment: result.adjustment,
      deltaSeconds: result.deltaSeconds,
      netAdjustment: result.netAdjustment,
      aliveCount: result.aliveCount,
      increaseVotes: result.increaseVotes,
      decreaseVotes: result.decreaseVotes,
    });
  } catch (err) {
    console.error("[adjustDayTime]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

export const handleChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code, message, channel } = req.body;

    if (!room_code || !message?.trim()) {
      return res
        .status(400)
        .json({ error: "room_code and message are required" });
    }

    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: {
        status: true,
        state_meta: true,
        nurse_met_doctor: true,
        room_size: true,
      },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Check player is alive and in room
    const player = await prisma.gamePlayer.findUnique({
      where: { room_code_user_id: { room_code, user_id: userId } },
      include: { user: { select: { full_name: true } } },
    });
    if (!player) return res.status(403).json({ error: "Not in this room" });
    if (player.status !== "ALIVE")
      return res.status(403).json({ error: "Eliminated players cannot chat" });

    // Determine the target Pusher channel
    let targetChannel = `game-${room_code}`;

    if (channel === "mafia") {
      // Only during NIGHT, only for MAFIA (and met HITMAN)
      if (room.status !== "NIGHT") {
        return res
          .status(409)
          .json({ error: "Mafia chat is only available during NIGHT" });
      }
      const meta = room.state_meta
        ? typeof room.state_meta === "string"
          ? JSON.parse(room.state_meta)
          : room.state_meta
        : {};
      if (
        player.role !== "MAFIA" &&
        player.role !== "MAFIA_HELPER" &&
        !(player.role === "HITMAN" && meta.hitman_met_mafia)
      )
        return res
          .status(403)
          .json({ error: "Only Mafia team can use this channel" });
      targetChannel = `private-mafia-${room_code}`;
    } else if (channel === "doc") {
      if (room.status !== "NIGHT") {
        return res
          .status(409)
          .json({ error: "Doctor-Nurse chat is only available during NIGHT" });
      }
      if (room.room_size !== "TWELVE") {
        return res
          .status(403)
          .json({
            error: "Doctor-Nurse chat is only available in 12-player rooms",
          });
      }
      if (!["DOCTOR", "NURSE"].includes(player.role)) {
        return res
          .status(403)
          .json({ error: "Only Doctor and Nurse can use this channel" });
      }
      if (!room.nurse_met_doctor) {
        return res
          .status(403)
          .json({ error: "Doctor and Nurse can chat only after they meet" });
      }
      targetChannel = `private-doc-${room_code}`;
    } else if (channel === "citizen") {
      if (room.status !== "NIGHT") {
        return res
          .status(409)
          .json({ error: "Citizen chat is only available during NIGHT" });
      }
      if (player.role !== "CITIZEN") {
        return res
          .status(403)
          .json({ error: "Only Citizens can use this channel" });
      }
      targetChannel = `private-citizen-${room_code}`;
    } else {
      // Global chat — DISCUSSION only
      if (room.status !== "DISCUSSION") {
        return res
          .status(409)
          .json({ error: "Chat is only allowed during DISCUSSION phase" });
      }
    }

    await pusher.trigger(targetChannel, "chat-message", {
      userId,
      name: player.user.full_name,
      message: message.trim(),
      channel: channel || "global",
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[chat]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ─── PUSHER AUTH ──────────────────────────────────────────────────────────────

export const handlePusherAuth = async (req, res) => {
  try {
    const socketId = req.body.socket_id;
    const channel = req.body.channel_name;
    const userId = req.user.userId;

    if (!socketId || !channel) {
      return res
        .status(400)
        .json({ error: "socket_id and channel_name are required" });
    }

    // ── Private user channel: private-{userId} ─────────────────────────────
    if (
      channel.startsWith("private-") &&
      !channel.startsWith("private-mafia-") &&
      !channel.startsWith("private-doc-") &&
      !channel.startsWith("private-hitman-") &&
      !channel.startsWith("private-citizen-")
    ) {
      // Personal channel — only the owner
      if (!channel.includes(userId)) {
        return res
          .status(403)
          .json({
            error: "Cannot subscribe to another player's private channel",
          });
      }
      const auth = pusher.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    }

    // ── Private mafia channel: private-mafia-{roomCode} ────────────────────
    if (channel.startsWith("private-mafia-")) {
      const roomCode = channel.replace("private-mafia-", "");
      const player = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
        select: { role: true },
      });
      if (!player) return res.status(403).json({ error: "Not in this room" });

      const room = await prisma.gameRoom.findUnique({
        where: { room_code: roomCode },
        select: { state_meta: true },
      });
      const meta = room?.state_meta
        ? typeof room.state_meta === "string"
          ? JSON.parse(room.state_meta)
          : room.state_meta
        : {};

      // MAFIA and MAFIA_HELPER always; HITMAN only if met mafia
      if (
        player.role !== "MAFIA" &&
        player.role !== "MAFIA_HELPER" &&
        !(player.role === "HITMAN" && meta.hitman_met_mafia)
      ) {
        return res
          .status(403)
          .json({ error: "Not authorized for mafia channel" });
      }
      const auth = pusher.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    }

    // ── Private doc-nurse channel: private-doc-{roomCode} ──────────────────
    if (channel.startsWith("private-doc-")) {
      const roomCode = channel.replace("private-doc-", "");
      const player = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
        select: { role: true },
      });
      if (!player) return res.status(403).json({ error: "Not in this room" });

      const room = await prisma.gameRoom.findUnique({
        where: { room_code: roomCode },
        select: { nurse_met_doctor: true, room_size: true },
      });
      if (room?.room_size !== "TWELVE") {
        return res
          .status(403)
          .json({ error: "Doc channel is only available in 12-player rooms" });
      }
      if (!room.nurse_met_doctor) {
        return res
          .status(403)
          .json({
            error: "Doc channel unlocks only after Doctor and Nurse meet",
          });
      }
      if (!["DOCTOR", "NURSE"].includes(player.role)) {
        return res
          .status(403)
          .json({ error: "Not authorized for doc channel" });
      }
      const auth = pusher.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    }

    // ── Private hitman-mafia channel: private-hitman-{roomCode} ────────────
    if (channel.startsWith("private-hitman-")) {
      const roomCode = channel.replace("private-hitman-", "");
      const player = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
        select: { role: true },
      });
      if (!player) return res.status(403).json({ error: "Not in this room" });

      const room = await prisma.gameRoom.findUnique({
        where: { room_code: roomCode },
        select: { state_meta: true },
      });
      const meta = room?.state_meta
        ? typeof room.state_meta === "string"
          ? JSON.parse(room.state_meta)
          : room.state_meta
        : {};

      if (!meta.hitman_met_mafia) {
        return res.status(403).json({ error: "Hitman has not met mafia yet" });
      }

      if (!["HITMAN", "MAFIA"].includes(player.role)) {
        return res
          .status(403)
          .json({ error: "Not authorized for hitman channel" });
      }
      const auth = pusher.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    }

    // ── Private citizen channel: private-citizen-{roomCode} ──────────────────
    if (channel.startsWith("private-citizen-")) {
      const roomCode = channel.replace("private-citizen-", "");
      const player = await prisma.gamePlayer.findUnique({
        where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
        select: { role: true },
      });
      if (!player) return res.status(403).json({ error: "Not in this room" });

      if (player.role !== "CITIZEN") {
        return res
          .status(403)
          .json({ error: "Not authorized for citizen channel" });
      }
      const auth = pusher.authorizeChannel(socketId, channel);
      return res.status(200).json(auth);
    }

    // Fallback — deny unknown private channels
    return res.status(403).json({ error: "Unknown private channel" });
  } catch (err) {
    console.error("[pusherAuth]", err.message);
    return res.status(500).json({ error: err.message });
  }
};
