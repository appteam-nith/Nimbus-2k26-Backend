const pusher = require("../../config/pusher");

const sendChatMessage = async (roomCode, player, message, phase) => {
  const channel = (phase === 'NIGHT' && player.role === 'MAFIA') 
    ? `private-mafia-${roomCode}` 
    : `presence-room-${roomCode}`;

  const payload = {
    senderId: player.id,
    senderName: player.name,
    message: message,
    timestamp: new Date().toISOString(),
  };

  await pusher.trigger(channel, "chat-message", payload);
  return payload;
};

module.exports = { sendChatMessage };