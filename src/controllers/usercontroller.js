import {
  findUserById,
  updateUser,
  deleteUser,
} from "../services/user/userService.js";
import prisma from "../config/prisma.js";
// import admin from "../config/firebase.js";

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
    // Compute user's leaderboard rank based on ordering:
    // 1) experience (desc), 2) experience_updated_at (asc), 3) full_name (asc)
    const userExp = user.experience ?? 0;
    const userExpTs = user.experience_updated_at ?? user.created_at;
    const userName = user.full_name ?? "";

    const aheadCount = await prisma.user.count({
      where: {
        OR: [
          { experience: { gt: userExp } },
          {
            AND: [
              { experience: { equals: userExp } },
              { experience_updated_at: { lt: userExpTs } },
            ],
          },
          {
            AND: [
              { experience: { equals: userExp } },
              { experience_updated_at: { equals: userExpTs } },
              { full_name: { lt: userName } },
            ],
          },
        ],
      },
    });

    const rank = aheadCount + 1;

    res.json({
      success: true,
      user,
      // Backwards-compatible keys expected by frontend
      points: userExp,
      mafia_points: userExp,
      rank,
      mafia_rank: rank,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name, nickname } = req.body ?? {};

    const hasName = typeof name === "string";
    const hasNickname = typeof nickname === "string" || nickname === null;

    if (!hasName && !hasNickname) {
      return res.status(400).json({ error: "No fields to update provided" });
    }

    const trimmedName = hasName ? name.trim() : undefined;
    if (hasName && !trimmedName) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }

    let normalizedNickname;
    if (hasNickname) {
      if (nickname === null) {
        normalizedNickname = null;
      } else {
        const trimmedNickname = nickname.trim();
        normalizedNickname = trimmedNickname.length === 0 ? null : trimmedNickname;
      }
    }

    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await updateUser(existing.user_id, {
      name: trimmedName,
      nickname: normalizedNickname,
    });
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
        // Skip Firebase deletion in development without Firebase config
        if (process.env.NODE_ENV === 'development' && !process.env.FIREBASE_PROJECT_ID) {
          console.warn('⚠️  Skipping Firebase user deletion for development');
        } else {
          await admin.auth().deleteUser(existing.google_id);
        }
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
