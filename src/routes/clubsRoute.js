import { Router } from "express";
import {
  createClub,
  createEvent,
  getEventsByClub,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getAllClubs,
  getClubById
} from "../controllers/clubControllers.js";

const router = Router();

// /api/clubs

// Club routes
router.post("/create", createClub);
router.get("/", getAllClubs);
router.get("/:club_id", getClubById);

// Event routes
router.post("/:club_id/events", createEvent);       // Club ka event banao
router.get("/:club_id/events", getEventsByClub);    // Club ke sab events
router.get("/events/all", getAllEvents);             // Sab clubs ke events
router.get("/events/:event_id", getEventById);      // Single event
router.put("/events/:event_id", updateEvent);       // Update event
router.delete("/events/:event_id", deleteEvent);    // Delete event

export default router;