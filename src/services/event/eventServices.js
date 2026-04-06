import prisma from "../../config/prisma.js";

// Fetch events for a specific date (YYYY-MM-DD)
const fetchEventsByDate = async (dateString) => {
    const start = new Date(`${dateString}T00:00:00.000Z`);
    const end   = new Date(`${dateString}T23:59:59.999Z`);

    return prisma.event.findMany({
        where: {
            event_time: { gte: start, lte: end },
        },
        select: {
            event_id:     true,
            event_name:   true,
            venue:        true,
            event_time:   true,
            image_url:    true,
            extra_details: true,
        },
        orderBy: { event_time: 'asc' },
    });
};

// Fetch all events — ordered by date ascending
const fetchAllEvents = async () => {
    return prisma.event.findMany({
        select: {
            event_id:     true,
            event_name:   true,
            venue:        true,
            event_time:   true,
            image_url:    true,
            extra_details: true,
        },
        orderBy: { event_time: 'asc' },
    });
};

// Fetch a single event by ID
const fetchEventById = async (eventId) => {
    return prisma.event.findUnique({
        where: { event_id: eventId },
        select: {
            event_id:     true,
            event_name:   true,
            venue:        true,
            event_time:   true,
            image_url:    true,
            extra_details: true,
        },
    });
};

// Insert a new event.
// extra_details is a JSON column — we store { description, day } there
// so the frontend timeline can display them without schema changes.
const insertEvent = async ({ event_name, venue, event_time, organizing_club_id, image_url, description, day }) => {
    return prisma.event.create({
        data: {
            event_name,
            venue,
            event_time:          new Date(event_time),
            organizing_club_id:  Number(organizing_club_id),
            image_url:           image_url ?? null,
            extra_details:       { description: description ?? '', day: day ?? 1 },
        },
    });
};

export { fetchEventsByDate, fetchAllEvents, fetchEventById, insertEvent };
