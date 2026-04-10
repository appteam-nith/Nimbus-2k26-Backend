import express from "express";
import {
  getRooms,
  createRoom,
  verifyPassword,
  updateLock,
  getMessages,
  sendMessage,
  joinRoom,
  leaveRoom
} from "../controllers/communityChatController.js";

const router = express.Router();

router.get("/rooms", getRooms);
router.post("/rooms", createRoom);
router.post("/rooms/:name/verify", verifyPassword);
router.post("/rooms/:name/lock", updateLock);
router.post("/rooms/:name/join", joinRoom);
router.post("/rooms/:name/leave", leaveRoom);
router.get("/rooms/:name/messages", getMessages);
router.post("/rooms/:name/messages", sendMessage);

export default router;
