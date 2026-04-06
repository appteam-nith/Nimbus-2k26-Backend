import { Router } from "express";
import protect from "../middlewares/authMiddleware.js";
import {
  handleCreateRoom,
  handleJoinRoom,
  handleGetRoom,
  handleStartGame,
  handleVote,
  handleChat,
  handlePusherAuth,
} from "../controllers/gameController.js";

const router = Router();

// All game routes require JWT auth
router.use(protect);

// ─── ROOM ─────────────────────────────────────────────────────────────────────
router.post("/rooms", handleCreateRoom);           // Create room
router.post("/rooms/join", handleJoinRoom);        // Join by code
router.get("/rooms/:code", handleGetRoom);         // Get room state (reconnect)

// ─── GAME ─────────────────────────────────────────────────────────────────────
router.post("/start", handleStartGame);            // Host starts game
router.post("/vote", handleVote);                  // Vote / night action

// ─── CHAT ─────────────────────────────────────────────────────────────────────
router.post("/chat", handleChat);                  // Send chat (DISCUSSION only)

// ─── PUSHER ───────────────────────────────────────────────────────────────────
router.post("/pusher/auth", handlePusherAuth);     // Pusher channel auth

export default router;
