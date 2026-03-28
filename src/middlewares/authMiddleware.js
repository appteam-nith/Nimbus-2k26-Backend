import { requireAuth, getAuth } from "@clerk/express";

/**
 * Drop-in replacement for the old JWT `protect` middleware.
 * Uses Clerk's requireAuth() — automatically verifies the session token
 * from the `Authorization: Bearer <clerk_session_token>` header.
 *
 * Unauthenticated requests receive a 401 response automatically.
 */
export { requireAuth as default, getAuth };
