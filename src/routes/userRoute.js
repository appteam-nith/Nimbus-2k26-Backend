import { Router } from "express";
import { syncClerkUser, getUserProfile, updateUserProfile, updateBalance } from "../controllers/usercontroller.js";
import { getEventsByDate } from "../controllers/eventControllers.js";
import validateDate from "../middlewares/valDateMiddleware.js";
import protect from "../middlewares/authMiddleware.js";

const router = Router();

// ─── Clerk Sync ──────────────────────────────────────────────────────────────
// Must be called by the client once after login to create/update DB record.
router.post("/sync", protect(), syncClerkUser);

// ─── User Profile (protected) ─────────────────────────────────────────────────
router.get("/profile", protect(), getUserProfile);
router.put("/profile", protect(), updateUserProfile);
router.put("/balance", protect(), updateBalance);

// ─── Event Timeline ───────────────────────────────────────────────────────────
router.get("/events", validateDate, getEventsByDate);

export default router;