import { Router } from "express";
import { getEventsByDate, getAllEvents, getEventById, createEvent } from "../controllers/eventControllers.js";

const router = Router();

// GET /api/events          → all events (no date filter)
// GET /api/events?date=YYYY-MM-DD → events for that specific date
router.get('/', getAllEvents);

// GET /api/events/:id
router.get('/:id', getEventById);

// POST /api/events  (admin use — push an event from backend)
router.post('/', createEvent);

export default router;
