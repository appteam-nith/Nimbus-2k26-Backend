import jwt from "jsonwebtoken";

/**
 * Generates a signed JWT for a given user.
 * @param {string} userId - The user's UUID from the database.
 * @returns {string} Signed JWT token.
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export default generateToken;
