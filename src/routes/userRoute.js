import { Router } from "express";
import { 
  syncClerkUser, 
  sendOtp, 
  verifyEmailOtp,
  registerUser, 
  loginUser, 
  getUserProfile, 
  updateUserProfile, 
  updateBalance 
} from "../controllers/usercontroller.js";
import { getEventsByDate } from "../controllers/eventControllers.js";
import validateDate from "../middlewares/valDateMiddleware.js";
import protect from "../middlewares/authMiddleware.js";

const router = Router();

// ─── CLERK AUTHENTICATION ──────────────────────────────────────────────────
// Must be called by the client once after login to create/update DB record.
router.post("/sync", protect, syncClerkUser);

// ─── EMAIL VERIFICATION + LEGACY AUTH SHIMS ─────────────────────────────────
router.post('/send-otp', sendOtp);
router.post('/send-verification-otp', sendOtp);
router.post('/verify-email-otp', verifyEmailOtp);
router.post('/register', registerUser);
router.post('/login', loginUser);

router.post('/forgot-password', (_req, res) => {
  res.status(410).json({
    error: "Password reset is handled by Clerk. Use Clerk's reset-password flow in the client.",
  });
});

router.post('/reset-password', (_req, res) => {
  res.status(410).json({
    error: "Password reset is handled by Clerk. Use Clerk's reset-password flow in the client.",
  });
});

// ─── DEPRECATED: Google OAuth idToken route ──────────────────────────────────
// Google Sign-In is now handled by Clerk. Clients should use Clerk's Google
// provider and then call POST /sync to create/update the DB record.
router.post('/auth/google', (_req, res) => {
  res.status(410).json({
    error: "This endpoint is deprecated. Google Sign-In is now handled by Clerk. " +
           "Use Clerk's SDK on the client, then call POST /api/users/sync.",
  });
});

// ─── USER PROFILE (Protected Hybrid) ────────────────────────────────────────
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.put('/balance', protect, updateBalance);

// ─── EVENT TIMELINE ─────────────────────────────────────────────────────────
router.get('/events', validateDate, getEventsByDate);

export default router;
