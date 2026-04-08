import { randomUUID } from "crypto";
import prisma from "../../config/prisma.js";
import pusher from "../../config/pusher.js";
import { buildRoleAssignments, validateRoomSize } from "./roleService.js";
import { PHASE_DURATION } from "./resolveService.js";

const ROOM_SIZE_TO_COUNT = {
  FIVE: 5,
  EIGHT: 8,
  TWELVE: 12,
};

function parseStateMeta(meta) {
  if (!meta) return {};
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return meta;
}

/**
 * Starts the game:
 *   1. Validates host + player count
 *   2. Assigns roles via roleService
 *   3. Sets status -> NIGHT, starts timer
 *   4. Broadcasts game-started + sends each player their role privately
 */
export async function startGame(roomCode, hostUserId, devMode = false) {
  const { phaseEndsAt, gamePlayers } = await prisma.$transaction(async (tx) => {
    // Guard against concurrent starts by locking the room row first.
    await tx.$queryRaw`
      SELECT room_code
      FROM "GameRoom"
      WHERE room_code = ${roomCode}
      FOR UPDATE
    `;

    const room = await tx.gameRoom.findUnique({
      where: { room_code: roomCode },
      include: { players: true },
    });

    if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
    if (room.host_id !== hostUserId) {
      throw Object.assign(new Error("Only the host can start the game"), {
        status: 403,
      });
    }
    if (room.status !== "LOBBY") {
      throw Object.assign(new Error("Game is already in progress"), {
        status: 409,
      });
    }

    const realPlayerCount = room.players.length;
    let players = room.players;
    let bots = [];
    let roomSizeEnum;

    if (devMode) {
      const actualSize = ROOM_SIZE_TO_COUNT[room.room_size] ?? 5;
      const botCount = actualSize - realPlayerCount;

      if (botCount < 0) {
        throw Object.assign(
          new Error("Too many real players for selected room size"),
          { status: 400 }
        );
      }

      const botNames = [
        "Bot Aarav",
        "Bot Riya",
        "Bot Karan",
        "Bot Priya",
        "Bot Arjun",
        "Bot Neha",
        "Bot Vikram",
        "Bot Ananya",
        "Bot Rohan",
        "Bot Divya",
        "Bot Siddharth",
      ];

      for (let i = 0; i < botCount; i++) {
        const botUserId = randomUUID();
        const botName = botNames[i] ?? `Bot ${i + 1}`;

        await tx.user.upsert({
          where: { user_id: botUserId },
          update: {},
          create: {
            user_id: botUserId,
            full_name: botName,
            email: `${botUserId}@bot.local`,
          },
        });

        const botPlayer = await tx.gamePlayer.create({
          data: {
            room_code: roomCode,
            user_id: botUserId,
            isBot: true,
          },
          select: { id: true, user_id: true },
        });

        bots.push({
          userId: botUserId,
          id: botPlayer.id,
        });
      }

      if (botCount > 0) {
        const updatedRoom = await tx.gameRoom.findUnique({
          where: { room_code: roomCode },
          include: { players: true },
        });
        players = updatedRoom?.players ?? players;
      }

      roomSizeEnum = room.room_size ?? "FIVE";
    } else {
      roomSizeEnum = validateRoomSize(realPlayerCount);
      if (!roomSizeEnum) {
        throw Object.assign(
          new Error(
            `Player count ${realPlayerCount} is invalid. Must be 5, 8, or 12.`
          ),
          { status: 400 }
        );
      }
    }

    const assignments = buildRoleAssignments(players, roomSizeEnum);

    if (devMode) {
      bots = bots.map((bot) => ({
        ...bot,
        role: assignments[players.find((p) => p.user_id === bot.userId)?.id] || null,
      }));
    }

    const phaseEndsAt = new Date(Date.now() + PHASE_DURATION.NIGHT);
    const existingMeta = parseStateMeta(room.state_meta);
    const nextMeta = { ...existingMeta };

    // Reset only game-start keys we own; preserve any unrelated runtime keys.
    nextMeta.hitman_resolved = false;
    nextMeta.night_resolved = false;
    nextMeta.hitman_met_mafia = false;
    nextMeta.bounty_vip_player_id = null;
    nextMeta.bounty_vip_dead = false;
    nextMeta.bounty_kill_unlocked = false;
    nextMeta.reporter_used = false;
    nextMeta.reporter_result = null;
    nextMeta.early_deaths = [];
    nextMeta.dev_mode = devMode;
    nextMeta.bots = bots;

    await tx.gameRoom.update({
      where: { room_code: roomCode },
      data: {
        room_size: roomSizeEnum,
        status: "NIGHT",
        round: 1,
        phase_ends_at: phaseEndsAt,
        state_meta: nextMeta,
      },
    });

    for (const [playerId, role] of Object.entries(assignments)) {
      await tx.gamePlayer.update({
        where: { id: playerId },
        data: { role },
      });
    }

    const gamePlayers = await tx.gamePlayer.findMany({
      where: { room_code: roomCode },
      select: { user_id: true, role: true, isBot: true },
    });

    return { phaseEndsAt, gamePlayers };
  });

  // Broadcast game-started to the whole room.
  await pusher.trigger(`game-${roomCode}`, "game-started", {
    phase: "NIGHT",
    round: 1,
    phaseEndsAt: phaseEndsAt.toISOString(),
    devMode,
  });

  // Tell the global browse rooms channel that this room is no longer in LOBBY.
  await pusher.trigger("rooms", "room-closed", {
    roomCode,
  });

  // In dev mode, also broadcast ALL roles so every player can see the full board.
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
        ...(devMode && p.user_id === hostUserId ? { allRoles } : {}),
      })
    )
  );
}
