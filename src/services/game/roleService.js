// Team legend:
// Mafia team  : MAFIA, HITMAN (mafia helper)
//               MAFIA_HELPER reserved for future 2nd mafia helper role
// Citizen team: CITIZEN, DOCTOR, COP, NURSE, BOUNTY_HUNTER, PROPHET, REPORTER

/**
 * Each game size config has:
 *   fixed      - roles always in the game, mapped to their count
 *   randomPool - { roles: [...], pick: N } - pick N unique roles randomly from the pool
 *
 * 5-player  (5):  MAFIA(1) + DOCTOR(1) + COP(1) + 2 random citizen specials = 5
 * 8-player  (8):  MAFIA(2) + HITMAN(1) + DOCTOR(1) + COP(1) + BOUNTY_HUNTER + PROPHET + REPORTER = 8
 * 12-player (12): MAFIA(3) + HITMAN(1) + DOCTOR(1) + COP(1) + NURSE(1) +
 *                 BOUNTY_HUNTER(1) + PROPHET(1) + REPORTER(1) + CITIZEN(2) = 12
 */
const ROLE_CONFIG = {
  FIVE: {
    fixed: {
      MAFIA: 1,
      DOCTOR: 1,
      COP: 1,
    },
    randomPool: { roles: ["BOUNTY_HUNTER", "PROPHET", "REPORTER"], pick: 2 },
  },

  EIGHT: {
    fixed: {
      MAFIA: 2,
      HITMAN: 1,
      DOCTOR: 1,
      COP: 1,
      BOUNTY_HUNTER: 1,
      PROPHET: 1,
      REPORTER: 1,
    },
    randomPool: null,
  },

  TWELVE: {
    fixed: {
      MAFIA: 3,
      HITMAN: 1,
      DOCTOR: 1,
      COP: 1,
      NURSE: 1,
      BOUNTY_HUNTER: 1,
      PROPHET: 1,
      REPORTER: 1,
      CITIZEN: 2,
    },
    randomPool: null,
  },
};

const ALL_ROLES = new Set([
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

/**
 * Shuffles an array in-place using Fisher-Yates.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Picks `n` unique elements at random from an array.
 */
function pickRandom(arr, n) {
  return shuffle([...arr]).slice(0, n);
}

function buildRolePool(roomSize) {
  const config = ROLE_CONFIG[roomSize];
  if (!config) throw new Error(`Unknown room size: ${roomSize}`);

  const rolePool = [];
  for (const [role, count] of Object.entries(config.fixed)) {
    for (let i = 0; i < count; i++) rolePool.push(role);
  }

  if (config.randomPool) {
    const { roles, pick } = config.randomPool;
    rolePool.push(...pickRandom(roles, pick));
  }

  return rolePool;
}

/**
 * Assigns roles to all players in a room based on room size.
 * If hostRoleOverride + hostUserId are provided, the host is forced
 * to that role and everyone else is randomized from the adjusted pool.
 * Returns a map of { playerId -> GameRole }.
 * Does NOT write to DB; caller handles transaction.
 */
export function buildRoleAssignments(
  players,
  roomSize,
  hostRoleOverride = null,
  hostUserId = null
) {
  const rolePool = buildRolePool(roomSize);

  if (rolePool.length !== players.length) {
    throw new Error(
      `Role pool size ${rolePool.length} does not match player count ${players.length}`
    );
  }

  const assignments = {};
  const normalizedHostRole =
    typeof hostRoleOverride === "string"
      ? hostRoleOverride.trim().toUpperCase()
      : null;

  if (normalizedHostRole && hostUserId) {
    if (!ALL_ROLES.has(normalizedHostRole)) {
      throw Object.assign(
        new Error(`Invalid dev host role override: ${hostRoleOverride}`),
        { status: 400 }
      );
    }

    const hostPlayer = players.find((p) => p.user_id === hostUserId);
    if (!hostPlayer) {
      throw Object.assign(new Error("Host is not present in this room"), {
        status: 400,
      });
    }

    // Inject requested host role by replacing one random pool slot.
    const replaceAt = Math.floor(Math.random() * rolePool.length);
    rolePool[replaceAt] = normalizedHostRole;

    // Reserve one instance for the host.
    const hostRoleIdx = rolePool.indexOf(normalizedHostRole);
    if (hostRoleIdx === -1) {
      throw new Error("Failed to reserve host override role in role pool");
    }
    rolePool.splice(hostRoleIdx, 1);
    assignments[hostPlayer.id] = normalizedHostRole;

    const remainingPlayers = players.filter((p) => p.id !== hostPlayer.id);
    shuffle(rolePool);
    remainingPlayers.forEach((p, idx) => {
      assignments[p.id] = rolePool[idx];
    });

    return assignments;
  }

  shuffle(rolePool);
  players.forEach((p, idx) => {
    assignments[p.id] = rolePool[idx];
  });

  return assignments;
}

/**
 * Validates that the player count matches the room size enum.
 */
export function validateRoomSize(playerCount) {
  if (playerCount === 5) return "FIVE";
  if (playerCount === 8) return "EIGHT";
  if (playerCount === 12) return "TWELVE";
  return null;
}
