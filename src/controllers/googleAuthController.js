import admin from "../config/firebase.js";
import { upsertGoogleUser } from "../services/user/userService.js";
import generateToken from "../services/generateTokenService.js";
import { isAllowedCollegeEmail, normalizeEmail } from "../utils/authEmail.js";

/**
 * POST /api/users/auth/google
 * Body: { idToken: "<Firebase ID token from Flutter client>" }
 *
 * Flow:
 *   1. Flutter signs in with Google via firebase_auth
 *   2. Gets a Firebase ID token (user.getIdToken())
 *   3. Sends it here
 *   4. We verify it with Firebase Admin, validate the college email,
 *      upsert the user in DB, and return a signed app JWT.
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body ?? {};

    if (!idToken)
      return res.status(400).json({ error: "idToken is required" });

    // Verify the Firebase ID token
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      console.error("Firebase token verification failed:", tokenErr.message);
      return res.status(401).json({ error: "Invalid or expired Firebase ID token" });
    }

    const {
      uid,
      email,
      name,
      email_verified: emailVerified,
    } = decoded;

    const normalizedEmail = normalizeEmail(email);

    if (!uid || !normalizedEmail)
      return res.status(401).json({ error: "Google authentication failed" });

    if (!emailVerified)
      return res.status(403).json({
        error: "Please verify your Google email before signing in",
      });

    // Domain restriction removed to allow app reviewers and all external users to login


    // Upsert user in DB (create on first sign-in, update on subsequent ones)
    const user = await upsertGoogleUser(uid, name, normalizedEmail);

    // Issue a short-lived app JWT for subsequent API calls
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
    console.error("Google auth error:", error.message, error.stack);
    // Surface a more specific error message for easier debugging
    const msg = error.message?.includes('column') || error.message?.includes('relation')
      ? `Database schema error: ${error.message}`
      : "Google authentication failed";
    return res.status(500).json({ error: msg });
  }
};

export { googleAuth };
