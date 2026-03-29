import prisma from "../prisma.js";

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

    res.status(201).json({
      success: true,
      data: club,
    });
  } catch (error) {
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


const addEvent = async (req, res) => {
  try {
    const {
      event_name,
      venue,
      event_time,
      organizing_club_id,
      image_url,
      extra_details,
    } = req.body;

    // basic validation
    if (!event_name || !venue || !event_time || !organizing_club_id) {
      return res.status(400).json({
        success: false,
        message: "event_name, venue, event_time and organizing_club_id are required",
      });
    }

    // check if club exists
    const clubExists = await prisma.club.findUnique({
      where: { club_id: organizing_club_id },
    });

    if (!clubExists) {
      return res.status(404).json({
        success: false,
        message: "Organizing club not found",
      });
    }

    // create event
    const event = await prisma.event.create({
      data: {
        event_name,
        venue,
        event_time: new Date(event_time),
        organizing_club_id,
        image_url,
        extra_details,
      },
    });

    return res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export {
    createClub,
    addEvent
}