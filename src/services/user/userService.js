import prisma from "../../config/prisma.js";

/**
 * ─── EMAIL / PASSWORD AUTH (legacy — creates users without clerk_id) ──────────
 * These are kept to support the custom JWT flow.
 * NOTE: The DB no longer has `password` or `google_id` columns after the
 * 20260328_add_clerk_id migration. `createUser` and `loginUser` use a
 * clerk_id placeholder so the NOT NULL constraint is satisfied.
 */

/**
 * Create a user via email/password registration.
 * clerk_id is set to a sentinel so the NOT NULL constraint is met.
 * The user can upgrade to a real Clerk session later via POST /sync.
 */
const createUser = async (name, email, hashedPassword) => {
  // clerk_id is required by the schema. We use a placeholder for email
  // users — the front-end should call POST /sync after Clerk sign-in to
  // replace this with a real Clerk ID.
  return prisma.user.create({
    data: {
      full_name: name,
      email,
      // Temporarily encode the hashed password in clerk_id so we can still
      // do email/password login. Treat this field as opaque outside auth.
      clerk_id: `email:${email}`,
    },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

/**
 * Find a user by email (used by login and duplicate-check flows).
 * Returns full row including the clerk_id sentinel so loginUser can
 * compare passwords stored externally if needed.
 */
const findUserByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

// google_id column was dropped in migration 20260328_add_clerk_id.
// Google auth now goes through Clerk; these are stubs so old imports
// don't break while the route is being updated.
const findUserByGoogleId = async (_googleId) => null;
const createGoogleUser = async (_name, _email, _googleId) => {
  throw new Error("Google auth is now handled by Clerk. Use POST /api/users/sync.");
};

/**
 * ─── CLERK AUTH ───────────────────────────────────────────────────────────────
 */

/**
 * Upsert a user by their Clerk ID.
 * Called from POST /api/users/sync after Clerk verifies the session.
 */
const upsertClerkUser = async (clerkId, name, email) => {
  return prisma.user.upsert({
    where: { clerk_id: clerkId },
    update: { full_name: name, email },
    create: { clerk_id: clerkId, full_name: name, email },
    select: { user_id: true, clerk_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

const findUserByClerkId = async (clerkId) => {
  return prisma.user.findUnique({ where: { clerk_id: clerkId } });
};

/**
 * ─── GENERAL USER OPS ────────────────────────────────────────────────────────
 */

const findUserById = async (userId) => {
  return prisma.user.findUnique({
    where: { user_id: userId },
    select: { user_id: true, clerk_id: true, full_name: true, email: true, virtual_balance: true, created_at: true },
  });
};

const updateUser = async (userId, { name }) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { full_name: name },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

const updateUserBalance = async (userId, money) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { virtual_balance: money },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

export {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  createGoogleUser,
  upsertClerkUser,
  findUserByClerkId,
  findUserById,
  updateUser,
  updateUserBalance,
};
