import {
  findUserById,
  updateUser,
  updateUserBalance,
} from "../services/user/userService.js";

// ─── PROTECTED PROFILE ────────────────────────────────────────────────────────
// All routes below require the JWT issued after Google sign-in.

const getRequestUser = async (req) => {
  if (req.user?.userId) return findUserById(req.user.userId);
  return null;
};

const getUserProfile = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "No fields to update provided" });

    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await updateUser(existing.user_id, { name });
    res.json({ success: true, message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateBalance = async (req, res) => {
  try {
    const { money } = req.body;
    if (money === undefined || money === null)
      return res.status(400).json({ error: "money field is required" });

    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await updateUserBalance(existing.user_id, money);
    res.json({ success: true, message: "Balance updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { getUserProfile, updateUserProfile, updateBalance };
