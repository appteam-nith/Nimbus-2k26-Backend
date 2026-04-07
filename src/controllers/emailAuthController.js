import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import generateToken from "../services/generateTokenService.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/user/emailService.js";
import {
  normalizeEmail,
  REVIEWER_WHITELIST,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "../utils/authEmail.js";

const BCRYPT_ROUNDS = 12;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Signs a short-lived JWT for email verification / password reset links. */
function signLinkToken(userId, email, expiresIn = "24h") {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn });
}

// ─── SIGN UP ──────────────────────────────────────────────────────────────────

/**
 * POST /api/users/auth/signup
 * Body: { name, email, password }
 * Creates an unverified user and sends verification email.
 */
export async function signUp(req, res) {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.is_verified) {
        // Resend verification email
        const token = signLinkToken(existing.user_id, existing.email);
        await sendVerificationEmail({ email: existing.email, full_name: existing.full_name }, token);
        return res.status(200).json({
          message: "Account already exists but is unverified. A new verification email has been sent.",
        });
      }
      return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        full_name: name.trim(),
        email: email.toLowerCase().trim(),
        password_hash,
        is_verified: false,
      },
    });

    const token = signLinkToken(user.user_id, user.email);
    await sendVerificationEmail({ email: user.email, full_name: user.full_name }, token);

    return res.status(201).json({
      message: "Account created! Check your inbox for a verification email.",
    });
  } catch (err) {
    console.error("[email-signup] Error:", err.message);
    return res.status(500).json({ error: "Sign up failed. Please try again." });
  }
}

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────

/**
 * GET /api/users/auth/verify-email?token=...
 * Verifies the user's email and returns an app JWT so they're immediately logged in.
 */
export async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send("<h2>Invalid verification link.</h2>");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).send("<h2>Verification link has expired or is invalid. Please sign up again.</h2>");
    }

    const user = await prisma.user.findUnique({ where: { user_id: decoded.userId } });
    if (!user) {
      return res.status(404).send("<h2>User not found.</h2>");
    }

    if (user.is_verified) {
      return res.status(200).send(`
        <h2>Email already verified!</h2>
        <p>You can now log in to Nimbus 2k26.</p>
      `);
    }

    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { is_verified: true },
    });

    // Respond with a simple success page — the app polls or user re-logs in
    return res.status(200).send(`
      <!DOCTYPE html><html><head><title>Email Verified</title>
      <meta charset="UTF-8"/>
      <style>
        body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4F5;}
        .card{background:#fff;border-radius:16px;padding:48px 40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;}
        h1{color:#1A3BB3;margin:0 0 12px;}p{color:#475569;}
        .check{font-size:56px;margin-bottom:16px;}
      </style></head>
      <body><div class="card">
        <div class="check">✅</div>
        <h1>Email Verified!</h1>
        <p>Your Nimbus 2k26 account is now active.</p>
        <p>Open the app and log in with your email and password.</p>
      </div></body></html>
    `);
  } catch (err) {
    console.error("[verify-email] Error:", err.message);
    return res.status(500).send("<h2>Something went wrong. Please try again.</h2>");
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * POST /api/users/auth/login
 * Body: { email, password }
 * Returns { token, user } same shape as Google OAuth.
 */
export async function login(req, res) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const isReviewerEmail =
      normalizedEmail === REVIEWER_EMAIL ||
      REVIEWER_WHITELIST.has(normalizedEmail);

    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user && isReviewerEmail && password === REVIEWER_PASSWORD) {
      const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      user = await prisma.user.create({
        data: {
          full_name: "Nimbus Reviewer",
          email: normalizedEmail,
          password_hash,
          is_verified: true,
        },
      });
    }

    if (!user || !user.password_hash) {
      // No account or Google-only account
      return res.status(401).json({ error: "No account found with this email. Sign up first or use Google." });
    }

    if (!user.is_verified && !isReviewerEmail) {
      return res.status(403).json({ error: "Please verify your email before logging in. Check your inbox." });
    }

    const passwordMatch =
      isReviewerEmail && password === REVIEWER_PASSWORD
        ? true
        : await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = generateToken(user.user_id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("[email-login] Error:", err.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

/**
 * POST /api/users/auth/forgot-password
 * Body: { email }
 * Sends a password reset link. Always responds 200 to prevent email enumeration.
 */
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body ?? {};
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Silently succeed even if user not found (prevents email enumeration)
    if (user && user.password_hash) {
      const token = signLinkToken(user.user_id, user.email, "1h");
      await sendPasswordResetEmail({ email: user.email, full_name: user.full_name }, token);
    }

    return res.status(200).json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("[forgot-password] Error:", err.message);
    return res.status(500).json({ error: "Failed to send reset email. Please try again." });
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

/**
 * POST /api/users/auth/reset-password?token=...
 * Body: { newPassword }
 * Resets the user's password.
 */
export async function resetPassword(req, res) {
  try {
    const { token } = req.query;
    const { newPassword } = req.body ?? {};

    if (!token) return res.status(400).json({ error: "Reset token is required" });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Reset link has expired or is invalid." });
    }

    const user = await prisma.user.findUnique({ where: { user_id: decoded.userId } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { password_hash },
    });

    return res.status(200).json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("[reset-password] Error:", err.message);
    return res.status(500).json({ error: "Password reset failed. Please try again." });
  }
}
