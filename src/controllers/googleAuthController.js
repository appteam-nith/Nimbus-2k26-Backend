import { OAuth2Client } from "google-auth-library";
import { upsertGoogleUser } from "../services/user/userService.js";
import generateToken from "../services/generateTokenService.js";
import { isAllowedCollegeEmail, normalizeEmail } from "../utils/authEmail.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/users/auth/google
 * Body: { idToken: "<Google ID token from Flutter client>" }
 *
 * Verifies the Google ID token, upserts the user in DB,
 * and returns a signed JWT for subsequent requests.
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body ?? {};

    if (!idToken)
      return res.status(400).json({ error: "idToken is required" });

    if (!process.env.GOOGLE_CLIENT_ID)
      return res.status(500).json({ error: "Google authentication is not configured" });

    // Verify the ID token with Google
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: "Invalid or expired Google ID token" });
    }

    const {
      sub: googleId,
      email,
      name,
      email_verified: emailVerified,
    } = payload ?? {};

    const normalizedEmail = normalizeEmail(email);

    if (!googleId || !normalizedEmail)
      return res.status(401).json({ error: "Google authentication failed" });

    if (!emailVerified)
      return res.status(403).json({
        error: "Please verify your Google email before signing in",
      });

    if (!isAllowedCollegeEmail(normalizedEmail))
      return res.status(403).json({
        error: "Only @nith.ac.in email addresses are allowed",
      });

    const user = await upsertGoogleUser(googleId, name, normalizedEmail);
    const token = generateToken(user.user_id);

    return res.status(200).json({
      success: true,
      message: "Google authentication successful",
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error.message);
    return res.status(500).json({ error: "Google authentication failed" });
  }
};

export { googleAuth };
