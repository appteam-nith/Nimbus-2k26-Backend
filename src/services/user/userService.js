import prisma from "../../config/prisma.js";

/**
 * Upsert a user by their Clerk ID.
 * Called from POST /api/users/sync after Clerk verifies the session.
 * Creates the user on first login, updates name/email on subsequent calls.
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
  upsertClerkUser,
  findUserByClerkId,
  findUserById,
  updateUser,
  updateUserBalance,
};