import { createUser, findUserByEmail, upsertClerkUser, findUserByClerkId, findUserById, updateUser, updateUserBalance } from "../services/user/userService.js";
import { clerkClient } from "@clerk/express";
import bcrypt from "bcrypt";
import generateToken from "../services/generateTokenService.js";
import { generateAndStoreOtp, verifyOtp } from "../services/user/otpService.js";
import { sendOtpEmail } from "../utils/emailService.js";
import { isAllowedCollegeEmail, isValidEmailFormat, normalizeEmail } from "../utils/authEmail.js";
import { createEmailAuthControllers } from "./userAuthControllerFactory.js";

/**
 * ─── CLERK AUTHENTICATION ──────────────────────────────────────────────────
 */

/**
 * POST /api/users/sync
 * Protected — must be called by the client right after Clerk login.
 */
const syncClerkUser = async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
    const name = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || email;

    const user = await upsertClerkUser(userId, name, email);

    res.status(200).json({
      success: true,
      message: "User synced successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ─── CUSTOM JWT AUTHENTICATION ──────────────────────────────────────────────
 */

const { sendOtp, registerUser, loginUser } = createEmailAuthControllers({
  createUser,
  findUserByEmail,
  hashPassword: (password) => bcrypt.hash(password, 10),
  comparePassword: (password, hashedPassword) => bcrypt.compare(password, hashedPassword),
  tokenGenerator: generateToken,
  generateAndStoreOtp,
  verifyOtp,
  sendOtpEmail,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
});

/**
 * ─── HYBRID USER PROFILE FUNCTIONS ──────────────────────────────────────────
 * These check for both Clerk session (req.auth) AND Custom JWT (req.user)
 */

const getHybridUser = async (req) => {
  if (req.auth && req.auth.userId) {
    return await findUserByClerkId(req.auth.userId);
  }
  if (req.user && req.user.userId) {
    return await findUserById(req.user.userId);
  }
  return null;
};

const getUserProfile = async (req, res) => {
  try {
    const user = await getHybridUser(req);
    if (!user) {
      return res.status(404).json({ error: "User not found. Call POST /sync first if using Clerk." });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "No fields to update provided" });

    const existing = await getHybridUser(req);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const user = await updateUser(existing.user_id, { name });
    res.json({ success: true, message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateBalance = async (req, res) => {
  try {
    const { money } = req.body;
    if (money === undefined || money === null) {
      return res.status(400).json({ error: "money field is required" });
    }

    const existing = await getHybridUser(req);
    if (!existing) return res.status(404).json({ error: "User not found." });

    const user = await updateUserBalance(existing.user_id, money);
    res.json({ success: true, message: "Balance updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export {
  syncClerkUser,
  sendOtp,
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  updateBalance,
};
