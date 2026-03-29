import {
  findUserByEmail,
  createEmailUser,
  findUserById,
  updateUser,
  updateUserBalance,
} from "../services/user/userService.js";
import { generateAndStoreOtp, verifyOtp } from "../services/user/otpService.js";
import { sendOtpEmail } from "../utils/emailService.js";
import {
  isAllowedCollegeEmail,
  isValidEmailFormat,
  normalizeEmail,
} from "../utils/authEmail.js";
import generateToken from "../services/generateTokenService.js";

// ─── EMAIL / OTP FLOW ─────────────────────────────────────────────────────────

/**
 * POST /api/users/send-otp
 * Body: { email }
 *
 * Step 1 of the OTP flow.
 * Validates the email, generates an OTP, emails it to the user.
 * Works for both new and existing email users.
 */
const sendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email)
      return res.status(400).json({ error: "email is required" });

    if (!isValidEmailFormat(email))
      return res.status(400).json({ error: "Please provide a valid email address" });

    if (!isAllowedCollegeEmail(email))
      return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

    const otp = generateAndStoreOtp(email);

    // Fire-and-forget — don't let email failures block the response
    sendOtpEmail(email, otp).catch((err) => {
      console.error(`Failed to send OTP to ${email}:`, err.message);
    });

    return res.status(200).json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/users/verify-otp
 * Body: { email, otp, name? }
 *
 * Step 2 of the OTP flow.
 * Verifies the OTP. If the user doesn't exist yet, creates them (requires name).
 * Returns a JWT on success — the client stores it for subsequent requests.
 */
const verifyOtpAndLogin = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { otp, name } = req.body;

    if (!email || !otp)
      return res.status(400).json({ error: "email and otp are required" });

    if (!isValidEmailFormat(email))
      return res.status(400).json({ error: "Invalid email address" });

    if (!isAllowedCollegeEmail(email))
      return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

    // Verify OTP
    const valid = verifyOtp(email, otp);
    if (!valid)
      return res.status(400).json({ error: "Invalid or expired OTP" });

    // Find or create the user
    let user = await findUserByEmail(email);

    if (!user) {
      // New user — name is required on first sign-up
      if (!name || name.trim().length === 0)
        return res.status(400).json({ error: "name is required for new accounts" });

      user = await createEmailUser(name.trim(), email);
    }

    const token = generateToken(user.user_id);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/users/resend-otp
 * Body: { email }
 *
 * Resends a fresh OTP to the given email.
 * Resets the expiry timer.
 */
const resendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email)
      return res.status(400).json({ error: "email is required" });

    if (!isValidEmailFormat(email))
      return res.status(400).json({ error: "Invalid email address" });

    if (!isAllowedCollegeEmail(email))
      return res.status(400).json({ error: "Only @nith.ac.in email addresses are allowed" });

    const otp = generateAndStoreOtp(email);

    sendOtpEmail(email, otp).catch((err) => {
      console.error(`Failed to resend OTP to ${email}:`, err.message);
    });

    return res.status(200).json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ─── PROTECTED PROFILE ───────────────────────────────────────────────────────

const getRequestUser = async (req) => {
  if (req.user?.userId) return findUserById(req.user.userId);
  return null;
};

const getUserProfile = async (req, res) => {
  try {
    const user = await getRequestUser(req);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "No fields to update provided" });

    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await updateUser(existing.user_id, { name });
    res.json({ success: true, message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateBalance = async (req, res) => {
  try {
    const { money } = req.body;
    if (money === undefined || money === null)
      return res.status(400).json({ error: "money field is required" });

    const existing = await getRequestUser(req);
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await updateUserBalance(existing.user_id, money);
    res.json({ success: true, message: "Balance updated", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export {
  sendOtp,
  verifyOtpAndLogin,
  resendOtp,
  getUserProfile,
  updateUserProfile,
  updateBalance,
};
