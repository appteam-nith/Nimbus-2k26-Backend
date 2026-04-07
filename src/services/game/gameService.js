import { randomUUID } from 'crypto';
import prisma from "../../config/prisma.js";
import pusher from "../../config/pusher.js";
import { buildRoleAssignments, validateRoomSize } from "./roleService.js";
import { PHASE_DURATION } from "./resolveService.js";

/**
 * Starts the game:
 *   1. Validates host + player count
 *   2. Assigns roles via roleService
 *   3. Sets status → NIGHT, starts timer
 *   4. Broadcasts game-started + sends each player their role privately
 */
export async function startGame(roomCode, hostUserId, devMode = false) {
  const room = await prisma.gameRoom.findUnique({
    where: { room_code: roomCode },
    include: { players: true },
  });

  if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
  if (room.host_id !== hostUserId)
    throw Object.assign(new Error("Only the host can start the game"), { status: 403 });
  if (room.status !== "LOBBY")
    throw Object.assign(new Error("Game is already in progress"), { status: 409 });

  const realPlayerCount = room.players.length;
  let players = room.players;
  let bots = [];
  let roomSizeEnum;

  if (devMode) {
    const actualSize = { FIVE: 5, EIGHT: 8, TWELVE: 12 }[room.room_size] ?? 5;
    const botCount = actualSize - realPlayerCount;

    if (botCount < 0) {
      throw Object.assign(new Error("Too many real players for selected room size"), { status: 400 });
    }

    const botNames = ["Bot Aarav", "Bot Riya", "Bot Karan", "Bot Priya", "Bot Arjun",
                      "Bot Neha", "Bot Vikram", "Bot Ananya", "Bot Rohan", "Bot Divya",
                      "Bot Siddharth"];

    for (let i = 0; i < botCount; i++) {
      const botUserId = randomUUID();
      const botName = botNames[i] ?? `Bot ${i + 1}`;

      await prisma.user.upsert({
        where: { user_id: botUserId },
        update: {},
        create: {
          user_id: botUserId,
          full_name: botName,
          email: `${botUserId}@bot.local`,
        },
      });

      await prisma.gamePlayer.create({
        data: {
          room_code: roomCode,
          user_id: botUserId,
          isBot: true,
          role: "MAFIA",
        },
      });

      bots.push({
        userId: botUserId,
        role: "MAFIA"
      });
    }

    const updatedRoom = await prisma.gameRoom.findUnique({
      where: { room_code: roomCode },
      include: { players: true },
    });
    players = updatedRoom.players;
    roomSizeEnum = room.room_size ?? "FIVE";
  } else {
    roomSizeEnum = validateRoomSize(realPlayerCount);
    if (!roomSizeEnum) {
      throw Object.assign(
        new Error(`Player count ${realPlayerCount} is invalid. Must be 5, 8, or 12.`),
        { status: 400 }
      );
    }
  }

  // Assign roles to real players only
  const realPlayers = players.filter(p => !p.isBot);
  const assignments = buildRoleAssignments(realPlayers, roomSizeEnum, devMode ? bots : []);

  // Write roles + update room in one transaction
  const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.NIGHT);

  await prisma.$transaction([
    // Update room and kick off NIGHT
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
          dev_mode: devMode,
          bots: bots,          // empty array if not dev mode
        },
      },
    }),
    // Write each real player's role
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
    devMode,
  });

  // Fetch all players to broadcast roles
  const gamePlayers = await prisma.gamePlayer.findMany({
    where: { room_code: roomCode },
    select: { user_id: true, role: true, isBot: true },
  });

  // In dev mode, also broadcast ALL roles so every player can see the full board
  const allRoles = devMode
    ? Object.fromEntries(gamePlayers.map((p) => [p.user_id, p.role]))
    : null;

  // Send each real player their own role privately.
  // In dev mode the HOST also receives allRoles so the role-board overlay works.
  const realGamePlayersForPusher = gamePlayers.filter((p) => !p.isBot);

  await Promise.all(
    realGamePlayersForPusher.map((p) =>
      pusher.trigger(`private-${p.user_id}`, "role-assigned", {
        roomCode,
        role: p.role,
        devMode,
        // Only include the full role map for the host
        ...(devMode && p.user_id === hostUserId ? { allRoles } : {}),
      })
    )
  );
}
