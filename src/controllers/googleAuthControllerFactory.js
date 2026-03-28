import generateToken from "../services/generateTokenService.js";
import { isAllowedCollegeEmail, normalizeEmail } from "../utils/authEmail.js";

const createGoogleAuthController = ({
  verifyIdToken,
  findUserByGoogleId,
  findUserByEmail,
  createGoogleUser,
  tokenGenerator = generateToken,
  googleClientId = process.env.GOOGLE_CLIENT_ID,
  isUniqueConstraintError = (error) => error?.code === "P2002",
}) => {
  return async (req, res) => {
    try {
      if (!googleClientId) {
        return res.status(500).json({ error: "Google authentication is not configured" });
      }

      const { idToken } = req.body ?? {};

      if (!idToken) {
        return res.status(400).json({ error: "idToken is required" });
      }

      const payload = await verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const { sub: googleId, email, name, email_verified: emailVerified } = payload ?? {};
      const normalizedEmail = normalizeEmail(email);

      if (!googleId || !normalizedEmail) {
        return res.status(401).json({ error: "Google authentication failed" });
      }

      if (!emailVerified) {
        return res.status(403).json({ error: "Please verify your Google email before signing in" });
      }

      if (!isAllowedCollegeEmail(normalizedEmail)) {
        return res.status(403).json({ error: "Only @nith.ac.in email addresses are allowed" });
      }

      let user = await findUserByGoogleId(googleId);

      if (!user) {
        const existing = await findUserByEmail(normalizedEmail);
        if (existing) {
          return res.status(409).json({
            error: "An account with this email already exists. Please log in with email/password.",
          });
        }

        try {
          user = await createGoogleUser(name, normalizedEmail, googleId);
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            user = await findUserByGoogleId(googleId);

            if (!user) {
              user = await findUserByEmail(normalizedEmail);
            }
          } else {
            throw error;
          }
        }
      }

      if (!user) {
        return res.status(500).json({ error: "Unable to complete Google authentication" });
      }

      const token = tokenGenerator(user.user_id);

      return res.json({
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
};

export { createGoogleAuthController };
