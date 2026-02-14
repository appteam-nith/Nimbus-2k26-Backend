
const { fetchEventsByDate } = require('../services/event/eventServices');
const { sendResponse } = require('../utils/response.util');

// Under Construction

const getEventsByDate = async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return sendResponse(res, 400, 'Date query parameter is required');
    }

    const events = await fetchEventsByDate(date);

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
