import prisma from "../config/prisma.js";

const createClub = async (req, res) => {
  try {
    const { club_name, department } = req.body;

    if (!club_name) {
      return res.status(400).json({
        success: false,
        message: "club_name is required",
      });
    }

    const club = await prisma.club.create({
      data: {
        club_name,
        department,
      },
    });
   
    console.log("Created club:", club);
    res.status(201).json({
      success: true,
      data: club,
    });
  } catch (error) {
    console.error("Error creating club:", error.message, "Stack:", error.stack);
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Club already exists",
      });
    }
 
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Create Event for a Club
const createEvent = async (req, res) => {
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

const getClubById = async (req, res) => {
  try {
    const { club_id } = req.params;
    const club = await prisma.club.findUnique({
      where: { club_id: parseInt(club_id) },
    });
    if (!club) return res.status(404).json({ error: "Club not found" });
    res.status(200).json({ club });
  } catch (error) {
    console.error("Error fetching club:", error.message);
    res.status(500).json({ error: error.message });
  }
};


// Get all Events of a Club
const getEventsByClub = async (req, res) => {
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
const getAllEvents = async (req, res) => {
  try {
    // Keep events that are upcoming OR currently live (started within last 60 min).
    const now = new Date();
    const liveWindowStart = new Date(now.getTime() - 60 * 60 * 1000);

    const events = await prisma.event.findMany({
      where: {
        event_time: { gte: liveWindowStart },
      },
      orderBy: { event_time: "asc" },
      include: {
        club: {
          select: { club_name: true, club_type: true },
        },
      },
    });

    res.status(200).json({ events });
  } catch (error) {
    console.error("Error fetching all events:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get single Event by ID
const getEventById = async (req, res) => {
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
const updateEvent = async (req, res) => {
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
const deleteEvent = async (req, res) => {
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

const getAllClubs = async (req, res) => {
  try {
    const clubs = await prisma.club.findMany({ orderBy: { created_at: "desc" } });
    res.status(200).json({ data: clubs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export {
  createClub,
  createEvent,      // ✅ yeh add karo
  getEventsByClub,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getAllClubs,
  getClubById
}
