import prisma from "../../config/prisma.js";

const fetchEventsByDate = async (dateString) => {
    const start = new Date(`${dateString}T00:00:00.000Z`);
    const end = new Date(`${dateString}T23:59:59.999Z`);

    return prisma.event.findMany({
        where: {
            event_time: {
                gte: start,
                lte: end,
            },
        },
        select: {
            event_id: true,
            event_name: true,
            venue: true,
            event_time: true,
            image_url: true,
        },
        orderBy: {
            event_time: "asc",
        },
    });
};

const fetchEventById = async (eventId) => {
    return prisma.event.findUnique({
        where: { event_id: eventId },
        select: {
            event_id: true,
            event_name: true,
            venue: true,
            event_time: true,
            image_url: true,
        }

    });
};

export {
    fetchEventsByDate,
    fetchEventById
};
