import prisma from "../../config/prisma.js";

// ─── GOOGLE AUTH ──────────────────────────────────────────────────────────────

/**
 * Upsert a user identified by their Google sub (google_id).
 * Called every time a Google Sign-In succeeds.
 */
const upsertGoogleUser = async (googleId, name, email) => {
  return prisma.user.upsert({
    where: { google_id: googleId },
    update: { full_name: name, email },
    create: { google_id: googleId, full_name: name, email },
    select: {
      user_id: true,
      google_id: true,
      full_name: true,
      email: true,
      virtual_balance: true,
    },
  });
};

// ─── EMAIL / OTP AUTH ─────────────────────────────────────────────────────────

/**
 * Find a user by email — used by OTP login lookup and duplicate-check.
 */
const findUserByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

/**
 * Create a new user via email-only registration (no password, no google_id).
 * google_id is nullable so this is fine.
 */
const createEmailUser = async (name, email) => {
  return prisma.user.create({
    data: { full_name: name, email },
    select: {
      user_id: true,
      full_name: true,
      email: true,
      virtual_balance: true,
    },
  });
};

// ─── GENERAL USER OPS ────────────────────────────────────────────────────────

const findUserByGoogleId = async (googleId) => {
  return prisma.user.findUnique({ where: { google_id: googleId } });
};

const findUserById = async (userId) => {
  return prisma.user.findUnique({
    where: { user_id: userId },
    select: {
      user_id: true,
      google_id: true,
      full_name: true,
      email: true,
      virtual_balance: true,
      created_at: true,
    },
  });
};

const updateUser = async (userId, { name }) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { full_name: name },
    select: {
      user_id: true,
      full_name: true,
      email: true,
      virtual_balance: true,
    },
  });
};

const updateUserBalance = async (userId, money) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { virtual_balance: money },
    select: {
      user_id: true,
      full_name: true,
      email: true,
      virtual_balance: true,
    },
  });
};

export {
  upsertGoogleUser,
  findUserByEmail,
  createEmailUser,
  findUserByGoogleId,
  findUserById,
  updateUser,
  updateUserBalance,
};
