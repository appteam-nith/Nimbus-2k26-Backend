import prisma from "../config/prisma.js";
import pusher from "../config/pusher.js";
import { createRoom, joinRoom, getRoomState } from "../services/game/roomService.js";
import { startGame } from "../services/game/gameService.js";
import { submitVote } from "../services/game/voteService.js";

// ─── PHASE GUARD MAP ──────────────────────────────────────────────────────────
// Each vote_type is only valid in certain game phases
const VOTE_TYPE_PHASE = {
  DAY_LYNCH:          "VOTING",
  MAFIA_TARGET:       "NIGHT",
  DOC_SAVE:           "NIGHT",
  COP_INVESTIGATE:    "NIGHT",
  NURSE_ACTION:       "NIGHT",
  HITMAN_TARGET:      "NIGHT",
  BOUNTY_HUNTER_VIP:  "NIGHT",
  BOUNTY_HUNTER_SHOT: "NIGHT",
  REPORTER_EXPOSE:    "NIGHT",
};

// Which role is allowed to cast each vote type
const VOTE_TYPE_ROLE = {
  DAY_LYNCH:          null,             // anyone alive
  MAFIA_TARGET:       "MAFIA",
  DOC_SAVE:           "DOCTOR",
  COP_INVESTIGATE:    "COP",
  NURSE_ACTION:       "NURSE",
  HITMAN_TARGET:      "HITMAN",
  BOUNTY_HUNTER_VIP:  "BOUNTY_HUNTER",
  BOUNTY_HUNTER_SHOT: "BOUNTY_HUNTER",
  REPORTER_EXPOSE:    "REPORTER",
};

// Hitman early lockout — actions lock at T-5s before night end
const HITMAN_LOCKOUT_MS = 5_000;

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────

export const handleCreateRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_size } = req.body;

    if (!["FIVE", "EIGHT", "TWELVE"].includes(room_size)) {
      return res.status(400).json({ error: "room_size must be FIVE, EIGHT, or TWELVE" });
    }

    const code = await createRoom(userId, room_size);

    await pusher.trigger(`room-${code}`, "room-created", {
      roomCode: code,
      hostId: userId,
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

    if (!room_code) return res.status(400).json({ error: "room_code is required" });

    await joinRoom(room_code, userId);

    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { full_name: true },
    });

    await pusher.trigger(`room-${room_code}`, "player-joined", {
      userId,
      name: user?.full_name,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[joinRoom]", err.message);
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
    const { room_code } = req.body;

    if (!room_code) return res.status(400).json({ error: "room_code is required" });

    await startGame(room_code, userId);

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
      return res.status(400).json({ error: "room_code and vote_type are required" });
    }

    // Fetch room state
    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: { status: true, round: true, phase_ends_at: true, state_meta: true },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // ── Phase guard ─────────────────────────────────────────────────────────
    const requiredPhase = VOTE_TYPE_PHASE[vote_type];
    if (!requiredPhase) return res.status(400).json({ error: `Unknown vote_type: ${vote_type}` });
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
      if (!voterPlayer) return res.status(404).json({ error: "Player not in room" });
      if (voterPlayer.status !== "ALIVE") return res.status(403).json({ error: "Eliminated players cannot act" });

      // MAFIA_TARGET: any MAFIA member can vote (not just one)
      if (requiredRole === "MAFIA") {
        if (voterPlayer.role !== "MAFIA") {
          return res.status(403).json({ error: `Only MAFIA can cast ${vote_type}` });
        }
      } else if (voterPlayer.role !== requiredRole) {
        return res.status(403).json({ error: `Only ${requiredRole} can cast ${vote_type}` });
      }
    }

    // ── Parse state_meta ────────────────────────────────────────────────────
    const meta = room.state_meta
      ? typeof room.state_meta === "string"
        ? JSON.parse(room.state_meta)
        : room.state_meta
      : {};

    // ── Hitman T-5s lockout ─────────────────────────────────────────────────
    if (vote_type === "HITMAN_TARGET") {
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
          error: "HITMAN_TARGET requires target_meta with { targets: [id,id], roles: [role,role] }",
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
          return res.status(400).json({ error: "Hitman cannot target the Cop" });
        }
      }
    }

    // ── Bounty Hunter VIP — Night 1 only ────────────────────────────────────
    if (vote_type === "BOUNTY_HUNTER_VIP") {
      if (room.round !== 1) {
        return res.status(409).json({ error: "VIP selection is only allowed on Night 1" });
      }
    }

    // ── Bounty Hunter shot — only if kill unlocked ──────────────────────────
    if (vote_type === "BOUNTY_HUNTER_SHOT") {
      if (!meta.bounty_kill_unlocked) {
        return res.status(409).json({
          error: "Bounty Hunter kill is not yet unlocked (VIP must be killed first)",
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
      if (targetPlayer?.role === "HITMAN" && room.round <= 2) {
        // Hitman immunity on Night 1 and Night 2 — appears as CITIZEN
        result = "CITIZEN";
      } else if (targetPlayer?.role === "HITMAN") {
        // Past immunity — appears as HITMAN
        result = "HITMAN";
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
    }

    // Broadcast that a vote was cast (not who — just that someone did)
    await pusher.trigger(`game-${room_code}`, "vote-updated", {
      voterId,
      voteType: vote_type,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[vote]", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── CHAT ─────────────────────────────────────────────────────────────────────

export const handleChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { room_code, message, channel } = req.body;

    if (!room_code || !message?.trim()) {
      return res.status(400).json({ error: "room_code and message are required" });
    }

    const room = await prisma.gameRoom.findUnique({
      where: { room_code },
      select: { status: true, state_meta: true, nurse_met_doctor: true },
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
        return res.status(409).json({ error: "Mafia chat is only available during NIGHT" });
      }
      const meta = room.state_meta
        ? typeof room.state_meta === "string" ? JSON.parse(room.state_meta) : room.state_meta
        : {};
      if (player.role !== "MAFIA" && !(player.role === "HITMAN" && meta.hitman_met_mafia)) {
        return res.status(403).json({ error: "Only Mafia team can use this channel" });
      }
      targetChannel = `private-mafia-${room_code}`;
    } else if (channel === "doc") {
      if (room.status !== "NIGHT") {
        return res.status(409).json({ error: "Doctor-Nurse chat is only available during NIGHT" });
      }
      if (!["DOCTOR", "NURSE"].includes(player.role)) {
        return res.status(403).json({ error: "Only Doctor and Nurse can use this channel" });
      }
      if (player.role === "NURSE" && !room.nurse_met_doctor) {
        return res.status(403).json({ error: "Nurse has not met the Doctor yet" });
      }
      targetChannel = `private-doc-${room_code}`;
    } else {
      // Global chat — DISCUSSION only
      if (room.status !== "DISCUSSION") {
        return res.status(409).json({ error: "Chat is only allowed during DISCUSSION phase" });
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
      return res.status(400).json({ error: "socket_id and channel_name are required" });
    }

    // ── Private user channel: private-{userId} ─────────────────────────────
    if (channel.startsWith("private-") && !channel.startsWith("private-mafia-") &&
        !channel.startsWith("private-doc-") && !channel.startsWith("private-hitman-")) {
      // Personal channel — only the owner
      if (!channel.includes(userId)) {
        return res.status(403).json({ error: "Cannot subscribe to another player's private channel" });
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
        ? typeof room.state_meta === "string" ? JSON.parse(room.state_meta) : room.state_meta
        : {};

      // MAFIA can always access; HITMAN only if met mafia
      if (player.role !== "MAFIA" && !(player.role === "HITMAN" && meta.hitman_met_mafia)) {
        return res.status(403).json({ error: "Not authorized for mafia channel" });
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
        select: { nurse_met_doctor: true },
      });

      if (player.role === "DOCTOR") {
        // Doctor can always access this channel (even before nurse meets)
        const auth = pusher.authorizeChannel(socketId, channel);
        return res.status(200).json(auth);
      }
      if (player.role === "NURSE" && room?.nurse_met_doctor) {
        const auth = pusher.authorizeChannel(socketId, channel);
        return res.status(200).json(auth);
      }
      return res.status(403).json({ error: "Not authorized for doc channel" });
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
        ? typeof room.state_meta === "string" ? JSON.parse(room.state_meta) : room.state_meta
        : {};

      if (!meta.hitman_met_mafia) {
        return res.status(403).json({ error: "Hitman has not met mafia yet" });
      }

      if (!["HITMAN", "MAFIA"].includes(player.role)) {
        return res.status(403).json({ error: "Not authorized for hitman channel" });
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
