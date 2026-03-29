/**
 * Factory that creates email-auth controllers.
 *
 * POST /api/users/send-otp  — still active (email verification step)
 * POST /api/users/register  — DEPRECATED (password column dropped in migration)
 * POST /api/users/login     — DEPRECATED (password column dropped in migration)
 *
 * Google Sign-In and login are now handled entirely by Clerk.
 * After Clerk login the client must call POST /api/users/sync.
 */
const createEmailAuthControllers = ({
  findUserByEmail,
  generateAndStoreOtp,
  sendOtpEmail,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
  // The following are kept in the signature for backward-compat but unused:
  createUser,
  hashPassword,
  comparePassword,
  tokenGenerator,
  verifyOtp,
}) => {

  // ── POST /api/users/send-otp ───────────────────────────────────────────────
  const sendOtp = async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) return res.status(400).json({ error: "email is required" });
      if (!isValidEmailFormat(email)) return res.status(400).json({ error: "Please provide a valid email address" });
      if (!isAllowedCollegeEmail(email)) return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

      const existingUser = await findUserByEmail(email);
      if (existingUser) return res.status(400).json({ error: "Email already in use" });

      const otp = generateAndStoreOtp(email);

      sendOtpEmail(email, otp).catch((err) => {
        console.error(`Failed to send OTP to ${email}:`, err.message);
      });

      return res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  // ── POST /api/users/register — DEPRECATED ─────────────────────────────────
  // The `password` column was removed in migration 20260328_add_clerk_id.
  // New users must sign up via Clerk and then call POST /api/users/sync.
  const registerUser = async (_req, res) => {
    return res.status(410).json({
      error:
        "Email/password registration is no longer supported. " +
        "Please sign up via the app using Clerk authentication, then call POST /api/users/sync.",
    });
  };

  // ── POST /api/users/login — DEPRECATED ────────────────────────────────────
  // Same reason — password column gone. Clerk handles login now.
  const loginUser = async (_req, res) => {
    return res.status(410).json({
      error:
        "Email/password login is no longer supported. " +
        "Please log in via the app using Clerk authentication.",
    });
  };

  return { sendOtp, registerUser, loginUser };
};

export { createEmailAuthControllers };
