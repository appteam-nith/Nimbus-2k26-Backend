import prisma from "../../config/prisma.js";

// ─── TEAM LEGEND ──────────────────────────────────────────────────────────────
// Mafia team  : MAFIA, HITMAN (mafia helper)
//               MAFIA_HELPER reserved for future 2nd mafia helper role
// Citizen team: CITIZEN, DOCTOR, COP, NURSE, BOUNTY_HUNTER, PROPHET, REPORTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each game size config has:
 *   fixed      — roles always in the game, mapped to their count
 *   randomPool — { roles: [...], pick: N } — pick N unique roles randomly from the pool
 *
 * 5-player  (5):  MAFIA(1) + DOCTOR(1) + COP(1) + 1 random citizen special + CITIZEN(1)     = 5
 * 8-player  (8):  MAFIA(2) + HITMAN(1) + DOCTOR(1) + COP(1) + BOUNTY_HUNTER + PROPHET + REPORTER = 8
 * 12-player (12): MAFIA(3) + HITMAN(1) + DOCTOR(1) + COP(1) + NURSE(1) +
 *                 BOUNTY_HUNTER(1) + PROPHET(1) + REPORTER(1) + CITIZEN(2)                   = 12
 */
const ROLE_CONFIG = {
  FIVE: {
    fixed: {
      MAFIA: 1,
      DOCTOR: 1,
      COP: 1,
      CITIZEN: 1, // plain citizen fills the 5th slot
    },
    // 1 special citizen role picked randomly each game
    randomPool: { roles: ["BOUNTY_HUNTER", "PROPHET", "REPORTER"], pick: 1 },
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
    randomPool: null, // all 3 citizen specials are always present
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
      CITIZEN: 2, // 2 plain citizens to reach 12
    },
    randomPool: null,
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

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

// ─── ROLE ASSIGNMENT ──────────────────────────────────────────────────────────

/**
 * Assigns roles to all players in a room based on room_size.
 * Returns a map of { playerId → GameRole }.
 * Does NOT write to DB — caller handles the transaction.
 */
export function buildRoleAssignments(players, roomSize) {
  const config = ROLE_CONFIG[roomSize];
  if (!config) throw new Error(`Unknown room size: ${roomSize}`);

  // Build the flat role pool from fixed roles
  const rolePool = [];
  for (const [role, count] of Object.entries(config.fixed)) {
    for (let i = 0; i < count; i++) rolePool.push(role);
  }

  // Add randomly selected roles from the pool (e.g. 5-player citizen special)
  if (config.randomPool) {
    const { roles, pick } = config.randomPool;
    const picked = pickRandom(roles, pick);
    rolePool.push(...picked);
  }

  if (rolePool.length !== players.length) {
    throw new Error(
      `Role pool size ${rolePool.length} does not match player count ${players.length}`
    );
  }

  shuffle(rolePool);

  const assignments = {};
  players.forEach((p, idx) => {
    assignments[p.id] = rolePool[idx];
  });

  return assignments;
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

/**
 * Validates that the player count matches the room size enum.
 */
export function validateRoomSize(playerCount) {
  if (playerCount === 5) return "FIVE";
  if (playerCount === 8) return "EIGHT";
  if (playerCount === 12) return "TWELVE";
  return null;
}
