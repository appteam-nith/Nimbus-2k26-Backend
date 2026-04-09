import prisma from "../../config/prisma.js";

// ─── BOT / DEV-MODE HELPERS ───────────────────────────────────────────────────

function parseRoomMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

/**
 * Cleans up a dev-mode room completely:
 *   1. Deletes the GameRoom (cascades to GamePlayer + GameVote)
 *   2. Deletes the bot User records that were registered for this game
 *      (their IDs are stored in state_meta.bots)
 *   3. Broad safety-net sweep: removes every User whose full_name starts
 *      with "Bot " AND whose email ends with "@bot.local" — catches orphaned
 *      bots left behind by any crashed or force-ended dev-mode sessions.
 *
 * Safe to call multiple times (all operations are idempotent).
 */
export async function cleanupDevRoom(roomCode) {
  // 1. Read bot user IDs from state_meta BEFORE deleting the room.
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    select: { state_meta: true },
  });

  if (!room) return; // already gone — nothing to do

  const meta = parseRoomMeta(room.state_meta);
  const bots = Array.isArray(meta.bots) ? meta.bots : [];
  const botUserIds = bots.map((b) => b.userId).filter(Boolean);

  // 2. Delete the room (cascade handles GamePlayer + GameVote).
  await prisma.gameRoom
    .delete({ where: { room_code: roomCode } })
    .catch(() => {}); // ignore "record not found" if already deleted

  // 3. Delete the bot User records that were part of this specific game.
  if (botUserIds.length > 0) {
    await prisma.user
      .deleteMany({ where: { user_id: { in: botUserIds } } })
      .catch(() => {});
  }

  // 4. Broad safety-net: wipe every remaining orphaned bot user.
  //    Only matches the synthetic accounts we create (name "Bot …" + @bot.local email).
  await prisma.user
    .deleteMany({
      where: {
        full_name: { startsWith: "Bot ", mode: "insensitive" },
        email: { endsWith: "@bot.local" },
      },
    })
    .catch(() => {});
}

// ─── ROOM CODE GENERATOR ──────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  return Array.from(
    { length: 6 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join("");
}

async function uniqueCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateCode();
    const room = await prisma.gameRoom.findUnique({
      where: { room_code: code },
    });
    exists = !!room;
  }
  return code;
}

// ─── ROOM STATE READER ────────────────────────────────────────────────────────

/**
 * Returns the full room snapshot for GET /api/room/:code.
 * myUserId is used to include the caller's own role.
 */
export async function getRoomState(roomCode, myUserId) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    include: {
      players: {
        include: { user: { select: { full_name: true } } },
      },
    },
  });

  if (!room) return null;

  const roomMeta = room.state_meta
    ? typeof room.state_meta === "string"
      ? JSON.parse(room.state_meta || "{}")
      : (room.state_meta ?? {})
    : {};

  const isDevMode = roomMeta.dev_mode === true;
  const bots = Array.isArray(roomMeta.bots) ? roomMeta.bots : [];

  const players = room.players.map((p) => ({
    playerId: p.id,
    userId: p.user_id,
    name: p.user.full_name,
    status: p.status,
    // In dev mode only the HOST sees everyone's role; players only see their own
    role:
      (isDevMode && myUserId === room.host_id) ||
      p.user_id === myUserId ||
      room.status === "ENDED"
        ? p.role
        : undefined,
    isBot: p.isBot,
  }));

  const myPlayer = room.players.find((p) => p.user_id === myUserId);
  const timeRemaining = room.phase_ends_at
    ? Math.max(
        0,
        Math.floor((new Date(room.phase_ends_at) - Date.now()) / 1000),
      )
    : null;

  const aliveCount = room.players.filter((p) => p.status === "ALIVE").length;
  const discussionBaseSeconds =
    typeof roomMeta.discussion_base_seconds === "number" &&
    roomMeta.discussion_base_seconds > 0
      ? roomMeta.discussion_base_seconds
      : 120;
  const rawDiscussionVotes =
    roomMeta.discussion_time_vote_round === room.round &&
    roomMeta.discussion_time_votes &&
    typeof roomMeta.discussion_time_votes === "object" &&
    !Array.isArray(roomMeta.discussion_time_votes)
      ? roomMeta.discussion_time_votes
      : {};
  const myDayTimeAdjustment =
    rawDiscussionVotes[myUserId] === 1 || rawDiscussionVotes[myUserId] === -1
      ? rawDiscussionVotes[myUserId]
      : 0;
  const dayTimeDeltaSeconds =
    aliveCount > 0
      ? Math.max(1, Math.round(discussionBaseSeconds / aliveCount))
      : 0;

  const bountyVipPlayer = room.players.find(
    (p) => p.id === roomMeta.bounty_vip_player_id,
  );

  return {
    roomCode: room.room_code,
    hostId: room.host_id,
    status: room.status,
    round: room.round,
    roomSize: room.room_size,
    winner: room.winner,
    eliminatedThisRound: room.eliminated_this_round,
    phaseEndsAt: room.phase_ends_at,
    timeRemaining,
    players,
    myRole: myPlayer?.role ?? null,
    // ── Reconnect persistence flags ──────────────────────────────────────
    nurseMet: room.nurse_met_doctor ?? false,
    reporterUsed: roomMeta.reporter_used === true,
    hitmanMetMafia: roomMeta.hitman_met_mafia === true,
    bountyVipUserId: bountyVipPlayer?.user_id || null,
    myDayTimeAdjustment,
    dayTimeDeltaSeconds,
    devMode: isDevMode,
  };
}

// ─── CREATE ROOM ──────────────────────────────────────────────────────────────

export async function createRoom(userId, roomSize) {
  const code = await uniqueCode();

  await prisma.gameRoom.create({
    data: {
      room_code: code,
      host_id: userId,
      room_size: roomSize,
      players: {
        create: { user_id: userId },
      },
    },
  });

  return code;
}

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────

export const ROOM_SIZE_LIMITS = { FIVE: 5, EIGHT: 8, TWELVE: 12 };

export async function joinRoom(roomCode, userId) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    include: { _count: { select: { players: true } } },
  });

  if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
  if (room.status !== "LOBBY")
    throw Object.assign(new Error("Game already in progress"), { status: 409 });

  const limit = ROOM_SIZE_LIMITS[room.room_size];
  if (room._count.players >= limit)
    throw Object.assign(new Error("Room is full"), { status: 409 });

  // Idempotent — safe to call even if player already in room
  await prisma.gamePlayer.upsert({
    where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
    create: { room_code: roomCode, user_id: userId },
    update: { status: "ALIVE" },
  });

  return room;
}

// ─── PLAYER COUNT ─────────────────────────────────────────────────────────────

export async function getAlivePlayers(roomCode) {
  return prisma.gamePlayer.findMany({
    where: { room_code: roomCode, status: "ALIVE" },
    select: { id: true, user_id: true, role: true },
  });
}

// ─── LEAVE ROOM ───────────────────────────────────────────────────────────────

export async function leaveRoom(roomCode, userId) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    include: { players: true },
  });

  if (!room) return;

  // If game is in lobby, player can just leave
  const player = room.players.find((p) => p.user_id === userId);
  if (!player) return;

  if (room.status === "LOBBY") {
    await prisma.gamePlayer.delete({
      where: { room_code_user_id: { room_code: roomCode, user_id: userId } },
    });

    const remainingPlayers = room.players.filter((p) => p.user_id !== userId);

    if (remainingPlayers.length === 0) {
      // Room is empty, delete it
      await prisma.gameRoom.delete({
        where: { room_code: roomCode },
      });
      return { deleted: true };
    } else if (room.host_id === userId) {
      // Host left, assign a new host
      const newHost = remainingPlayers[0];
      await prisma.gameRoom.update({
        where: { room_code: roomCode },
        data: { host_id: newHost.user_id },
      });
      return { newHostId: newHost.user_id };
    }
  } else {
    // Game already in progress — only act on dev-mode rooms.
    const meta = parseRoomMeta(room.state_meta);

    if (meta.dev_mode === true && room.status !== "ENDED") {
      // Count non-bot players that are NOT the one currently leaving.
      const realPlayersRemaining = room.players.filter(
        (p) => p.user_id !== userId && !p.isBot,
      );

      if (realPlayersRemaining.length === 0) {
        // Last real human just left — tear down the whole dev room.
        await cleanupDevRoom(roomCode);
        return { deleted: true };
      }
    }
  }
  return {};
}
