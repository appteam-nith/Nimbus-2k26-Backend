import express from "express";
import {
  createEvent,
  getEventsByClub,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from "../controllers/eventControllers.js";

const router = express.Router();

router.get("/", getAllEvents);
router.get("/:event_id", getEventById);
router.post("/club/:club_id", createEvent);
router.put("/:event_id", updateEvent);
router.delete("/:event_id", deleteEvent);
router.get("/club/:club_id", getEventsByClub);

export default router;