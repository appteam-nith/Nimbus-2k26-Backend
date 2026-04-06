import { getAuth } from "@clerk/express";
import jwt from "jsonwebtoken";

/**
 * Hybrid Auth Middleware
 * Supports BOTH @clerk/express Clerk Sessions AND custom Email/JWT Sessions.
 *
 * Flow:
 *  1. If clerkMiddleware() has already verified a Clerk session → use it.
 *  2. Otherwise fall back to validating a custom JWT Bearer token.
 *  3. Reject with 401 if neither is present / valid.
 */
const protect = (req, res, next) => {
  // ── 1. Clerk session check ─────────────────────────────────────────────
  try {
    const clerkAuth = getAuth(req);
    if (clerkAuth && clerkAuth.userId) {
      req.auth = clerkAuth;
      return next();
    }
  } catch (_clerkErr) {
    // Clerk threw (e.g. malformed token / not a Clerk session) — fall through
  }

  // ── 2. Custom JWT check ────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Not authorized, no token present" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { userId: decoded.userId };
      return next();
    } catch (jwtErr) {
      // Covers JsonWebTokenError, TokenExpiredError, NotBeforeError, etc.
      const msg =
        jwtErr.name === "TokenExpiredError"
          ? "Not authorized, token expired"
          : "Not authorized, token failed";
      return res.status(401).json({ error: msg });
    }
  }

  // ── 3. No credentials at all ───────────────────────────────────────────
  return res.status(401).json({ error: "Not authorized, no token present" });
};

export { protect as default, getAuth };
