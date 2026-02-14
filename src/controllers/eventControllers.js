import { fetchEventsByDate } from '../services/event/eventServices.js';
import { sendResponse } from '../utils/response.util.js';

const getEventsByDate = async (req, res, next) => {
  try {
    const events = await fetchEventsByDate(req.query.date);

    return sendResponse(
      res,
      200,
      'Events fetched successfully',
      events,
      { count: events.length }
    );

  } catch (err) {
    next(err);
  }
};

export { getEventsByDate };
