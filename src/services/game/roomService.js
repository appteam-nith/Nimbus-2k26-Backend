import prisma from "../../config/prisma.js";

// ─── ROOM CODE GENERATOR ──────────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  return Array.from(
    { length: 6 },
    () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  ).join("");
}

async function uniqueCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateCode();
    const room = await prisma.gameRoom.findUnique({ where: { room_code: code } });
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

  const players = room.players.map((p) => ({
    userId: p.user_id,
    name: p.user.full_name,
    status: p.status,
    // Only reveal role to the player themselves (or if game ended)
    role: p.user_id === myUserId || room.status === "ENDED" ? p.role : undefined,
  }));

  const myPlayer = room.players.find((p) => p.user_id === myUserId);
  const timeRemaining =
    room.phase_ends_at
      ? Math.max(0, Math.floor((new Date(room.phase_ends_at) - Date.now()) / 1000))
      : null;

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
  if (room.status !== "LOBBY") throw Object.assign(new Error("Game already in progress"), { status: 409 });

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
