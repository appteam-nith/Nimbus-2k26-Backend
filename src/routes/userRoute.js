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
import { googleAuth } from "../controllers/googleAuthController.js";
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
router.post('/auth/google', googleAuth);

// ─── USER PROFILE (Protected Hybrid) ────────────────────────────────────────
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.put('/balance', protect, updateBalance);

// ─── EVENT TIMELINE ─────────────────────────────────────────────────────────
router.get('/events', validateDate, getEventsByDate);

export default router;
