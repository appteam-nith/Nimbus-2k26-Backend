import { Router } from "express";
import protect from "../middlewares/authMiddleware.js";
import {
  handleCreateRoom,
  handleJoinRoom,
  handleLeaveRoom,
  handleGetRoom,
  handleStartGame,
  handleVote,
  handleAdjustDayTime,
  handleChat,
  handlePusherAuth,
  handleListRooms,
} from "../controllers/gameController.js";

const router = Router();

// All game routes require JWT auth
router.use(protect);

// ─── ROOM ─────────────────────────────────────────────────────────────────────
router.get("/rooms", handleListRooms);             // List open lobby rooms
router.post("/rooms", handleCreateRoom);           // Create room
router.post("/rooms/join", handleJoinRoom);        // Join by code
router.post("/rooms/leave", handleLeaveRoom);      // Leave room
router.get("/rooms/:code", handleGetRoom);         // Get room state (reconnect)

// ─── GAME ─────────────────────────────────────────────────────────────────────
router.post("/start", handleStartGame);            // Host starts game
router.post("/vote", handleVote);                  // Vote / night action
router.post("/day-time", handleAdjustDayTime);     // Discussion timer adjust (+/-)

// ─── CHAT ─────────────────────────────────────────────────────────────────────
router.post("/chat", handleChat);                  // Send chat (DISCUSSION only)

// ─── PUSHER ───────────────────────────────────────────────────────────────────
router.post("/pusher/auth", handlePusherAuth);     // Pusher channel auth

export default router;
