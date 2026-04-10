import prisma from "../config/prisma.js";
import pusher from "../config/pusher.js";

// Fetch all rooms (sorted newest first)
export const getRooms = async (req, res) => {
  try {
    const rooms = await prisma.communityRoom.findMany({
      orderBy: [
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: { messages: true, members: true }
        }
      }
    });

    // Don't send passwords back
    const formattedRooms = rooms.map(room => {
      const { password, ...rest } = room;
      return rest;
    });

    res.status(200).json({ rooms: formattedRooms });
  } catch (err) {
    console.error("[getRooms]", err.message);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

// Create a new room
export const createRoom = async (req, res) => {
  try {
    const { name, createdById, createdByName, isLocked, password } = req.body;
    const trimmedName = name?.trim();

    if (!trimmedName) return res.status(400).json({ error: "Room name cannot be empty" });

    const existingRoom = await prisma.communityRoom.findUnique({
      where: { name: trimmedName }
    });

    if (existingRoom) {
      return res.status(409).json({ error: "A room with this name already exists." });
    }

    if (isLocked) {
      if (!password || password.trim().length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters." });
      }
    }

    const room = await prisma.communityRoom.create({
      data: {
        name: trimmedName,
        isLocked: !!isLocked,
        password: isLocked ? password.trim() : null,
        createdById,
        createdByName,
        messages: {
          create: [{
            senderNickname: "System",
            text: `Room created by ${createdByName}.`,
            isSystem: true
          }]
        }
      },
      include: {
        messages: true
      }
    });

    const { password: _, ...roomSafe } = room;

    await pusher.trigger("community-global", "room-created", roomSafe);
    await pusher.trigger(`community-${room.id}`, "chat-message", room.messages[0]);

    res.status(201).json({ room: roomSafe });
  } catch (err) {
    console.error("[createRoom]", err.message);
    res.status(500).json({ error: "Failed to create room" });
  }
};

// Verify room password
export const verifyPassword = async (req, res) => {
  try {
    const { name } = req.params;
    const { password } = req.body;

    const room = await prisma.communityRoom.findUnique({
      where: { name }
    });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (!room.isLocked) return res.status(200).json({ verified: true });
    
    if (room.password === password) {
      return res.status(200).json({ verified: true });
    } else {
      return res.status(401).json({ error: "Incorrect password", verified: false });
    }
  } catch (err) {
    console.error("[verifyPassword]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Update room lock
export const updateLock = async (req, res) => {
  try {
    const { name } = req.params;
    const { requesterUserId, shouldLock, password } = req.body;

    const room = await prisma.communityRoom.findUnique({
      where: { name }
    });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.createdById !== requesterUserId) {
      return res.status(403).json({ error: "Only the room creator can change room lock settings." });
    }

    let updatedRoom;
    let systemMessage;

    if (shouldLock) {
      if (!password || password.trim().length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters." });
      }
      updatedRoom = await prisma.communityRoom.update({
        where: { id: room.id },
        data: {
          isLocked: true,
          password: password.trim()
        }
      });
      systemMessage = "This room is now locked.";
    } else {
      updatedRoom = await prisma.communityRoom.update({
        where: { id: room.id },
        data: {
          isLocked: false,
          password: null
        }
      });
      systemMessage = "This room is now unlocked.";
    }

    const { password: _, ...roomSafe } = updatedRoom;

    // Send system message
    const msg = await prisma.communityMessage.create({
      data: {
        roomName: room.name,
        senderNickname: "System",
        text: systemMessage,
        isSystem: true
      }
    });

    await pusher.trigger("community-global", "room-updated", roomSafe);
    await pusher.trigger(`community-${updatedRoom.id}`, "chat-message", msg);

    res.status(200).json({ room: roomSafe });
  } catch (err) {
    console.error("[updateLock]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Join a room
export const joinRoom = async (req, res) => {
  try {
    const { name } = req.params;
    const { userId, nickname } = req.body;

    const room = await prisma.communityRoom.findUnique({
      where: { name }
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    try {
      await prisma.communityRoomMember.upsert({
        where: { roomName_nickname: { roomName: name, nickname } },
        update: {},
        create: { roomName: name, nickname }
      });
    } catch (e) {
      // ignored
    }

    const msg = await prisma.communityMessage.create({
      data: {
        roomName: room.name,
        senderNickname: "System",
        text: `${nickname} joined`,
        isSystem: true
      }
    });

    await pusher.trigger(`community-${room.id}`, "chat-message", msg);
    res.status(200).json({ message: "Joined successfully" });
  } catch (err) {
    console.error("[joinRoom]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Leave a room
export const leaveRoom = async (req, res) => {
  try {
    const { name } = req.params;
    const { nickname } = req.body;

    const room = await prisma.communityRoom.findUnique({
      where: { name }
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Broadcast leave message first
    const msg = await prisma.communityMessage.create({
      data: {
        roomName: room.name,
        senderNickname: "System",
        text: `${nickname} left`,
        isSystem: true
      }
    });
    await pusher.trigger(`community-${room.id}`, "chat-message", msg);

    await prisma.communityRoomMember.deleteMany({
      where: { roomName: name, nickname }
    });

    const remainingCount = await prisma.communityRoomMember.count({
      where: { roomName: name }
    });

    if (remainingCount <= 0) {
      // Destroy empty custom room
      await prisma.communityRoom.delete({ where: { id: room.id } });
      const { password: _, ...roomSafe } = room;
      await pusher.trigger("community-global", "room-deleted", roomSafe);
      return res.status(200).json({ message: "Left and room destroyed" });
    } else {
      return res.status(200).json({ message: "Left successfully" });
    }
  } catch (err) {
    console.error("[leaveRoom]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get messages for a room
export const getMessages = async (req, res) => {
  try {
    const { name } = req.params;
    const messages = await prisma.communityMessage.findMany({
      where: { roomName: name },
      orderBy: { sentAt: "asc" },
      take: 200 // reasonable limit
    });
    
    // For joining the room, we need the room object's ID for pusher subscription
    const room = await prisma.communityRoom.findUnique({ 
      where: { name },
      include: { members: true }
    });
    
    res.status(200).json({ messages, room });
  } catch (err) {
    console.error("[getMessages]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const { name } = req.params;
    const { senderNickname, text } = req.body;

    if (!senderNickname?.trim() || !text?.trim()) {
      return res.status(400).json({ error: "Nickname and text are required" });
    }

    const room = await prisma.communityRoom.findUnique({
      where: { name }
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const msg = await prisma.communityMessage.create({
      data: {
        roomName: room.name,
        senderNickname: senderNickname.trim(),
        text: text.trim(),
        isSystem: false
      }
    });

    await pusher.trigger(`community-${room.id}`, "chat-message", msg);
    res.status(200).json({ message: msg });
  } catch (err) {
    console.error("[sendMessage]", err.message);
    res.status(500).json({ error: err.message });
  }
};

// PUBLIC CHAT
export const getPublicMessages = async (req, res) => {
  try {
    const messages = await prisma.publicChatMessage.findMany({
      orderBy: { sentAt: "asc" },
      take: 200
    });
    res.status(200).json({ messages });
  } catch (err) {
    console.error("[getPublicMessages]", err.message);
    res.status(500).json({ error: err.message });
  }
};

export const sendPublicMessage = async (req, res) => {
  try {
    const { senderNickname, text } = req.body;
    if (!senderNickname?.trim() || !text?.trim()) {
      return res.status(400).json({ error: "Nickname and text required" });
    }
    const msg = await prisma.publicChatMessage.create({
      data: {
        senderNickname: senderNickname.trim(),
        text: text.trim(),
        isSystem: false
      }
    });
    await pusher.trigger('public-chat', 'chat-message', msg);
    res.status(200).json({ message: msg });
  } catch (err) {
    console.error("[sendPublicMessage]", err.message);
    res.status(500).json({ error: err.message });
  }
};
