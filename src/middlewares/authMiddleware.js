import { getAuth } from "@clerk/express";
import jwt from "jsonwebtoken";

/**
 * Hybrid Auth Middleware
 * Supports BOTH @clerk/express Google Sessions AND custom Email/JWT Sessions
 */
const protect = (req, res, next) => {
  try {
    // 1. Check if Clerk's middleware populated auth
    const clerkAuth = getAuth(req);
    if (clerkAuth && clerkAuth.userId) {
      // Valid Clerk Session
      req.auth = clerkAuth;
      return next();
    }
  } catch (error) {
    // Clerk error, gracefully fallback to JWT
  }

  // 2. Check for Custom JWT Token
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Mimic structure so controllers know it's a generic user ID
      req.user = { userId: decoded.userId };
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ error: "Not authorized, no token present" });
};

// Export `protect` as default and keep `getAuth` available for controllers
export { protect as default, getAuth };
