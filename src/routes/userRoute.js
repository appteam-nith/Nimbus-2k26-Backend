import { Router } from "express";
import { googleAuth } from "../controllers/googleAuthController.js";
import {
  sendOtp,
  verifyOtpAndLogin,
  resendOtp,
  getUserProfile,
  updateUserProfile,
  updateBalance,
} from "../controllers/usercontroller.js";
import { getEventsByDate } from "../controllers/eventControllers.js";
import validateDate from "../middlewares/valDateMiddleware.js";
import protect from "../middlewares/authMiddleware.js";

const router = Router();

// ─── GOOGLE AUTH ──────────────────────────────────────────────
// Body: { idToken }  →  returns { token, user }
router.post("/auth/google", googleAuth);

// ─── EMAIL / OTP AUTH ─────────────────────────────────────────
// Step 1: send a 4-digit OTP to the college email
// Body: { email }
router.post("/send-otp", sendOtp);

// Step 2: verify OTP and receive a JWT
// Body: { email, otp, name? }   ← name required only for new accounts
router.post("/verify-otp", verifyOtpAndLogin);

// Resend a fresh OTP (resets expiry)
// Body: { email }
router.post("/resend-otp", resendOtp);

// ─── PROTECTED PROFILE ────────────────────────────────────────
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.put("/balance", protect, updateBalance);

// ─── EVENTS (public) ─────────────────────────────────────────
router.get("/events", validateDate, getEventsByDate);

export default router;
