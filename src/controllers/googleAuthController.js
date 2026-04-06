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
  console.log("[google-auth] ── Request received ──────────────────────────");
  try {
    const { idToken } = req.body ?? {};

    if (!idToken) {
      console.log("[google-auth] ✗ No idToken in request body");
      return res.status(400).json({ error: "idToken is required" });
    }
    console.log("[google-auth] ✓ idToken received (length=%d, prefix=%s…)", idToken.length, idToken.substring(0, 20));

    // Verify the Firebase ID token
    let decoded;
    try {
      console.log("[google-auth] → Verifying Firebase ID token…");
      decoded = await admin.auth().verifyIdToken(idToken);
      console.log("[google-auth] ✓ Firebase token verified — uid=%s email=%s", decoded.uid, decoded.email);
    } catch (tokenErr) {
      console.error("[google-auth] ✗ Firebase token verification failed:", tokenErr.code, tokenErr.message);
      return res.status(401).json({ error: "Invalid or expired Firebase ID token" });
    }

    const {
      uid,
      email,
      name,
      email_verified: emailVerified,
    } = decoded;

    const normalizedEmail = normalizeEmail(email);
    console.log("[google-auth] → uid=%s | name=%s | email=%s | verified=%s", uid, name, normalizedEmail, emailVerified);

    if (!uid || !normalizedEmail) {
      console.log("[google-auth] ✗ Missing uid or email after decode");
      return res.status(401).json({ error: "Google authentication failed" });
    }

    if (!emailVerified) {
      console.log("[google-auth] ✗ Email not verified");
      return res.status(403).json({
        error: "Please verify your Google email before signing in",
      });
    }

    // Domain restriction removed to allow app reviewers and all external users to login
    console.log("[google-auth] ✓ Validation passed");

    // Upsert user in DB (create on first sign-in, update on subsequent ones)
    console.log("[google-auth] → Upserting user in DB…");
    const user = await upsertGoogleUser(uid, name, normalizedEmail);
    console.log("[google-auth] ✓ DB upsert done — user_id=%s full_name=%s", user.user_id, user.full_name);

    // Issue a short-lived app JWT for subsequent API calls
    const token = generateToken(user.user_id);
    console.log("[google-auth] ✓ JWT generated (length=%d)", token.length);

    console.log("[google-auth] ── Returning 200 success ──────────────────");
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
    console.error("[google-auth] ✗ UNHANDLED ERROR:", error.message, error.stack);
    // Surface a more specific error message for easier debugging
    const msg = error.message?.includes('column') || error.message?.includes('relation')
      ? `Database schema error: ${error.message}`
      : "Google authentication failed";
    return res.status(500).json({ error: msg });
  }
};

export { googleAuth };
