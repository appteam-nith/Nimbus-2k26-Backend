import { Router } from "express";
import { 
  syncClerkUser, 
  sendOtp, 
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

// ─── JWT CUSTOM AUTHENTICATION ──────────────────────────────────────────────
router.post('/send-otp', sendOtp);
router.post('/register', registerUser);
router.post('/login', loginUser);

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
