import { sendResponse } from '../utils/response.util.js';

const validateDate = (req, res, next) => {
    const { date } = req.query;

    if (!date) {
        return sendResponse(res, 400, 'Date query parameter is required');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return sendResponse(res, 400, 'Date must be in YYYY-MM-DD format');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return sendResponse(res, 400, 'Invalid date value');
    }

    next();
};

export default validateDate;
