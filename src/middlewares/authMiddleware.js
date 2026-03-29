import jwt from "jsonwebtoken";

/**
 * JWT Auth Middleware
 *
 * Reads a Bearer token from the Authorization header,
 * verifies it against JWT_SECRET, and attaches
 * req.user = { userId } for downstream handlers.
 *
 * Works identically whether the JWT was issued after
 * Google Sign-In or after OTP verification.
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized, no token present" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Not authorized, no token present" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: decoded.userId };
    return next();
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Not authorized, token expired"
        : "Not authorized, token failed";
    return res.status(401).json({ error: msg });
  }
};

export default protect;
