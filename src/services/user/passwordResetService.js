import crypto from "crypto";
import bcrypt from "bcrypt";
import prisma from "../../config/prisma.js";

/**
 * Generates a secure random reset token, stores its hash and expiry in the DB,
 * and returns the plain token to be delivered to the user (via email etc.).
 */
const createPasswordResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.user.update({
    where: { user_id: userId },
    data: { reset_token: tokenHash, reset_token_expires: expiresAt },
  });

  return token;
};

/**
 * Finds a user whose reset token matches and has not expired.
 */
const findUserByResetToken = async (token) => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return prisma.user.findFirst({
    where: {
      reset_token: tokenHash,
      reset_token_expires: { gt: new Date() },
    },
  });
};

/**
 * Sets a new hashed password and clears the reset token fields.
 */
const resetUserPassword = async (userId, newPassword) => {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { user_id: userId },
    data: { password: hashedPassword, reset_token: null, reset_token_expires: null },
  });
};

export { createPasswordResetToken, findUserByResetToken, resetUserPassword };
