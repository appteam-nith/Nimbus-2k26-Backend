import { upsertClerkUser, findUserByClerkId, findUserById, updateUser, updateUserBalance } from "../services/user/userService.js";
import { getAuth, clerkClient } from "@clerk/express";

/**
 * POST /api/users/sync
 * Protected — must be called by the client right after Clerk login.
 * Upserts the Clerk user into your Postgres DB so app-specific data
 * (virtual_balance, portfolio, trades) can be linked to them.
 */
const syncClerkUser = async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch user details from Clerk
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
 * GET /api/users/profile
 * Returns the Postgres user record for the authenticated Clerk user.
 */
const getUserProfile = async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    const user = await findUserByClerkId(clerkId);
    if (!user) {
      return res.status(404).json({ error: "User not found. Call POST /sync first." });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/users/profile
 * Updates the user's display name.
 */
const updateUserProfile = async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "No fields to update provided" });
    }

    const existing = await findUserByClerkId(clerkId);
    if (!existing) {
      return res.status(404).json({ error: "User not found. Call POST /sync first." });
    }

    const user = await updateUser(existing.user_id, { name });
    res.json({ success: true, message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /api/users/balance
 * Updates the user's virtual balance.
 */
const updateBalance = async (req, res) => {
  try {
    const { userId: clerkId } = getAuth(req);
    const { money } = req.body;

    if (money === undefined || money === null) {
      return res.status(400).json({ error: "money field is required" });
    }

    const existing = await findUserByClerkId(clerkId);
    if (!existing) {
      return res.status(404).json({ error: "User not found. Call POST /sync first." });
    }

    const user = await updateUserBalance(existing.user_id, money);
    res.json({ success: true, message: "Balance updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { syncClerkUser, getUserProfile, updateUserProfile, updateBalance };