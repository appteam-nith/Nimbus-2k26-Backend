import { fetchEventsByDate, fetchAllEvents, fetchEventById, insertEvent } from '../services/event/eventServices.js';
import { sendResponse } from '../utils/response.js';

// GET /api/events?date=YYYY-MM-DD  → events for a specific date
const getEventsByDate = async (req, res, next) => {
  try {
    const events = await fetchEventsByDate(req.query.date);
    return sendResponse(res, 200, 'Events fetched successfully', events, { count: events.length });
  } catch (err) {
    next(err);
  }
};

// GET /api/events  → all events (optionally filtered by ?date=)
const getAllEvents = async (req, res, next) => {
  try {
    if (req.query.date) {
      const events = await fetchEventsByDate(req.query.date);
      return sendResponse(res, 200, 'Events fetched successfully', events, { count: events.length });
    }
    const events = await fetchAllEvents();
    return sendResponse(res, 200, 'Events fetched successfully', events, { count: events.length });
  } catch (err) {
    next(err);
  }
};

// GET /api/events/:id
const getEventById = async (req, res, next) => {
  try {
    const event = await fetchEventById(Number(req.params.id));
    if (!event) {
      return sendResponse(res, 404, 'Event not found', null);
    }
    return sendResponse(res, 200, 'Event fetched successfully', event);
  } catch (err) {
    next(err);
  }
};

// POST /api/events  — create a new event (admin use)
// Body: { event_name, venue, event_time, organizing_club_id, image_url?, description?, day? }
const createEvent = async (req, res, next) => {
  try {
    const event = await insertEvent(req.body);
    return sendResponse(res, 201, 'Event created successfully', event);
  } catch (err) {
    next(err);
  }
};

export { getEventsByDate, getAllEvents, getEventById, createEvent };
