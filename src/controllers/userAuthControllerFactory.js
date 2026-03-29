/**
 * Factory that creates email-auth controllers.
 *
 * POST /api/users/send-otp         — active (email verification step)
 * POST /api/users/verify-email-otp — active (verifies the OTP before Clerk sync)
 * POST /api/users/register  — DEPRECATED (password column dropped in migration)
 * POST /api/users/login     — DEPRECATED (password column dropped in migration)
 *
 * Google Sign-In and login are now handled entirely by Clerk.
 * After Clerk login the client must call POST /api/users/sync.
 */
const createEmailAuthControllers = ({
  generateAndStoreOtp,
  clearStoredOtp,
  verifyOtp,
  grantEmailVerification,
  sendOtpEmail,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
  // The following are kept in the signature for backward-compat but unused:
  createUser,
  hashPassword,
  comparePassword,
  tokenGenerator,
}) => {

  // ── POST /api/users/send-otp ───────────────────────────────────────────────
  const sendOtp = async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);

      if (!email) return res.status(400).json({ error: "email is required" });
      if (!isValidEmailFormat(email)) return res.status(400).json({ error: "Please provide a valid email address" });
      if (!isAllowedCollegeEmail(email)) return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

      const otp = generateAndStoreOtp(email);

      try {
        await sendOtpEmail(email, otp);
      } catch (err) {
        clearStoredOtp?.(email);
        console.error(`Failed to send OTP to ${email}:`, err.message);
        return res.status(502).json({ error: "Failed to send OTP email" });
      }

      return res.status(200).json({ success: true, message: "Verification OTP sent successfully" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };

  // ── POST /api/users/verify-email-otp ─────────────────────────────────────
  const verifyEmailOtp = async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

      if (!email) return res.status(400).json({ error: "email is required" });
      if (!otp) return res.status(400).json({ error: "otp is required" });
      if (!isValidEmailFormat(email)) return res.status(400).json({ error: "Please provide a valid email address" });
      if (!isAllowedCollegeEmail(email)) return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

      const isValid = verifyOtp(email, otp);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }

      grantEmailVerification?.(email);

      return res.status(200).json({
        success: true,
        message: "Email verified successfully. Complete Clerk sign-in and then call /api/users/sync.",
      });
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

  return { sendOtp, verifyEmailOtp, registerUser, loginUser };
};

export { createEmailAuthControllers };
