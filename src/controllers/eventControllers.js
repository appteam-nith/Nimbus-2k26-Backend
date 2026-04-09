import prisma from "../config/prisma.js";

// Create Event for a Club
export const createEvent = async (req, res) => {
  try {
    const { club_id } = req.params;
    const { event_name, venue, image_url, extra_details, event_time } = req.body;

    if (!event_name || !venue || !event_time) {
      return res.status(400).json({ error: "event_name, venue, event_time are required" });
    }

    // Club exist karta hai check karo
    const club = await prisma.club.findUnique({
      where: { club_id: parseInt(club_id) },
    });
    if (!club) return res.status(404).json({ error: "Club not found" });

    const event = await prisma.event.create({
      data: {
        event_name,
        venue,
        image_url: image_url || null,
        extra_details: extra_details || null,
        event_time: new Date(event_time),
        organizing_club_id: parseInt(club_id),
      },
    });

    res.status(201).json({ message: "Event created successfully", event });
  } catch (error) {
    console.error("Error creating event:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all Events of a Club
export const getEventsByClub = async (req, res) => {
  try {
    const { club_id } = req.params;

    const events = await prisma.event.findMany({
      where: { organizing_club_id: parseInt(club_id) },
      orderBy: { event_time: "asc" },
    });

    res.status(200).json({ events });
  } catch (error) {
    console.error("Error fetching events:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all Events (sab clubs ke)
export const getAllEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { event_time: "asc" },
      include: {
        club: {
          select: { club_name: true, club_type: true },
        },
      },
    });

    res.status(200).json({ data: events });
  } catch (error) {
    console.error("Error fetching all events:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get single Event by ID
export const getEventById = async (req, res) => {
  try {
    const { event_id } = req.params;

    const event = await prisma.event.findUnique({
      where: { event_id: parseInt(event_id) },
      include: {
        club: {
          select: { club_name: true, club_type: true, department: true },
        },
      },
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    res.status(200).json({ event });
  } catch (error) {
    console.error("Error fetching event:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Update Event
export const updateEvent = async (req, res) => {
  try {
    const { event_id } = req.params;
    const { event_name, venue, image_url, extra_details, event_time } = req.body;

    const existing = await prisma.event.findUnique({
      where: { event_id: parseInt(event_id) },
    });
    if (!existing) return res.status(404).json({ error: "Event not found" });

    const updated = await prisma.event.update({
      where: { event_id: parseInt(event_id) },
      data: {
        ...(event_name && { event_name }),
        ...(venue && { venue }),
        ...(image_url !== undefined && { image_url }),
        ...(extra_details !== undefined && { extra_details }),
        ...(event_time && { event_time: new Date(event_time) }),
      },
    });

    res.status(200).json({ message: "Event updated successfully", event: updated });
  } catch (error) {
    console.error("Error updating event:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Delete Event
export const deleteEvent = async (req, res) => {
  try {
    const { event_id } = req.params;

    const existing = await prisma.event.findUnique({
      where: { event_id: parseInt(event_id) },
    });
    if (!existing) return res.status(404).json({ error: "Event not found" });

    await prisma.event.delete({
      where: { event_id: parseInt(event_id) },
    });

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error.message);
    res.status(500).json({ error: error.message });
  }
};