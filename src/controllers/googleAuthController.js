import { OAuth2Client } from "google-auth-library";
import { createGoogleUser, findUserByEmail, findUserByGoogleId } from "../services/user/userService.js";
import { createGoogleAuthController } from "./googleAuthControllerFactory.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/users/auth/google
 * Body: { idToken: "<Firebase or Google credential idToken>" }
 *
 * Verifies the Google ID token, then either creates a new user or logs
 * in an existing one, returning a JWT for subsequent protected requests.
 */
const googleAuth = createGoogleAuthController({
  verifyIdToken: async ({ idToken, audience }) => {
    const ticket = await client.verifyIdToken({ idToken, audience });
    return ticket.getPayload();
  },
  findUserByGoogleId,
  findUserByEmail,
  createGoogleUser,
});

export { googleAuth };
