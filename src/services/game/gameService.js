import prisma from "../../config/prisma.js";
import pusher from "../../config/pusher.js";
import { buildRoleAssignments, validateRoomSize } from "./roleService.js";
import { getAlivePlayers, ROOM_SIZE_LIMITS } from "./roomService.js";
import { PHASE_DURATION } from "./resolveService.js";

/**
 * Starts the game:
 *   1. Validates host + player count
 *   2. Assigns roles via roleService
 *   3. Sets status → NIGHT, starts timer
 *   4. Broadcasts game-started + sends each player their role privately
 */
export async function startGame(roomCode, hostUserId) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    include: { players: true },
  });

  if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
  if (room.host_id !== hostUserId)
    throw Object.assign(new Error("Only the host can start the game"), { status: 403 });
  if (room.status !== "LOBBY")
    throw Object.assign(new Error("Game is already in progress"), { status: 409 });

  const playerCount = room.players.length;
  const roomSizeEnum = validateRoomSize(playerCount);
  if (!roomSizeEnum) {
    throw Object.assign(
      new Error(`Player count ${playerCount} is invalid. Must be 5, 8, or 12.`),
      { status: 400 }
    );
  }

  // Assign roles
  const assignments = buildRoleAssignments(room.players, roomSizeEnum);

  // Write roles + update room in one transaction
  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.NIGHT);

  await prisma.$transaction([
    // Update room_size (now confirmed) and kick off NIGHT
    prisma.gameRoom.update({
      where: { room_code: roomCode },
      data: {
        room_size: roomSizeEnum,
        status: "NIGHT",
        round: 1,
        phase_ends_at: phaseEndsAt,
        state_meta: {
          hitman_resolved: false,
          night_resolved: false,
          hitman_met_mafia: false,
          bounty_vip_player_id: null,
          bounty_vip_dead: false,
          bounty_kill_unlocked: false,
          reporter_used: false,
          reporter_result: null,
          early_deaths: [],
        },
      },
    }),
    // Write each player's role
    ...Object.entries(assignments).map(([playerId, role]) =>
      prisma.gamePlayer.update({
        where: { id: playerId },
        data: { role },
      })
    ),
  ]);

  // Broadcast game-started to the whole room
  await pusher.trigger(`game-${roomCode}`, "game-started", {
    phase: "NIGHT",
    round: 1,
    phaseEndsAt: phaseEndsAt.toISOString(),
  });

  // Send each player their own role privately
  const players = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode },
    select: { user_id: true, role: true },
  });

  await Promise.all(
    players.map((p) =>
      pusher.trigger(`private-${p.user_id}`, "role-assigned", {
        roomCode,
        role: p.role,
      })
    )
  );
}
