import prisma from "../../config/prisma.js";

// ─── GOOGLE AUTH ──────────────────────────────────────────────────────────────

const upsertGoogleUser = async (googleId, name, email) => {
  let user = await prisma.user.findUnique({
    where: { google_id: googleId },
    select: { user_id: true, google_id: true, full_name: true, email: true },
  });

  if (user) {
    return prisma.user.update({
      where: { google_id: googleId },
      data: { full_name: name, email },
      select: { user_id: true, google_id: true, full_name: true, email: true },
    });
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    select: { user_id: true },
  });

  if (existingByEmail) {
    return prisma.user.update({
      where: { email },
      data: { google_id: googleId, full_name: name },
      select: { user_id: true, google_id: true, full_name: true, email: true },
    });
  }

  return prisma.user.create({
    data: { google_id: googleId, full_name: name, email },
    select: { user_id: true, google_id: true, full_name: true, email: true },
  });
};

// ─── EMAIL / OTP AUTH ─────────────────────────────────────────────────────────

const findUserByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

const createEmailUser = async (name, email) => {
  return prisma.user.create({
    data: { full_name: name, email },
    select: { user_id: true, full_name: true, email: true },
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
      created_at: true,
    },
  });
};

const updateUser = async (userId, { name }) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { full_name: name },
    select: { user_id: true, full_name: true, email: true },
  });
};

const deleteUser = async (userId) => {
  return prisma.user.delete({
    where: { user_id: userId },
  });
};

export {
  upsertGoogleUser,
  findUserByEmail,
  createEmailUser,
  findUserByGoogleId,
  findUserById,
  updateUser,
  deleteUser,
};
