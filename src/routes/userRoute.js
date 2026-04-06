import { Router } from "express";
import { googleAuth } from "../controllers/googleAuthController.js";
import {
  getUserProfile,
  updateUserProfile,
  updateBalance,
  deleteAccount,
} from "../controllers/usercontroller.js";
import { getEventsByDate } from "../controllers/eventControllers.js";
import validateDate from "../middlewares/valDateMiddleware.js";
import protect from "../middlewares/authMiddleware.js";

const router = Router();

// ─── GOOGLE AUTH (Firebase) ────────────────────────────────────────────────────
// Body: { idToken: "<Firebase ID token>" }  →  returns { token, user }
router.post("/auth/google", googleAuth);

// ─── PROTECTED PROFILE ────────────────────────────────────────────────────────
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteAccount);
router.put("/balance", protect, updateBalance);

// ─── EVENTS (public) ─────────────────────────────────────────────────────────
router.get("/events", validateDate, getEventsByDate);

export default router;
