import {
  findUserById,
  updateUser,
  deleteUser,
} from "../services/user/userService.js";
import admin from "../config/firebase.js";

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

const updateBalance = async (_req, res) => {
  // virtual_balance was removed from the User schema — this endpoint is no longer active.
  res.status(410).json({ error: "Balance feature has been removed" });
};

const deleteAccount = async (req, res) => {
  try {
    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    // Delete from our DB first
    await deleteUser(existing.user_id);

    // Revoke Firebase account so the Google token is also invalidated
    if (existing.google_id) {
      try {
        await admin.auth().deleteUser(existing.google_id);
      } catch (_) {
        // Non-fatal: Firebase user may already be gone
      }
    }

    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { getUserProfile, updateUserProfile, updateBalance, deleteAccount };
