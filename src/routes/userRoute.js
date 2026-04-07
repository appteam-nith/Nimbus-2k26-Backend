import { Router } from "express";
import { googleAuth } from "../controllers/googleAuthController.js";
import {
  signUp,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
} from "../controllers/emailAuthController.js";
import {
  getUserProfile,
  updateUserProfile,
  updateBalance,
  deleteAccount,
} from "../controllers/usercontroller.js";
import protect from "../middlewares/authMiddleware.js";

const router = Router();

// ─── GOOGLE AUTH (Firebase) ────────────────────────────────────────────────────
router.post("/auth/google", googleAuth);

// ─── EMAIL AUTH ───────────────────────────────────────────────────────────────
router.post("/auth/signup", signUp);
router.post("/auth/login", login);
router.get("/auth/verify-email", verifyEmail);       // clicked from email link
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);  // ?token=... in query

// ─── PROTECTED PROFILE ────────────────────────────────────────────────────────
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteAccount);
router.put("/balance", protect, updateBalance);

export default router;

