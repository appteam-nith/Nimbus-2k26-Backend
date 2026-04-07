import nodemailer from "nodemailer";

/**
 * Creates a Nodemailer transporter using Gmail credentials in .env.
 * Env vars required: MAIL_USER, MAIL_PASS
 */
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    // Set a 5-second timeout so it fails quickly if ports are blocked locally
    connectionTimeout: 5000,
    greetingTimeout: 5000,
  });
}

const BACKEND_URL =
  process.env.BACKEND_URL || "https://nimbus-2k26-backend-2.onrender.com";

/** Styled HTML wrapper shared by all emails */
function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #F4F4F5;
      margin: 0; padding: 0;
      -webkit-font-smoothing: antialiased;
      color: #334155;
    }
    .wrapper { width: 100%; background-color: #F4F4F5; padding: 40px 0; }
    .container {
      max-width: 500px; margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
      border: 1px solid #E2E8F0;
    }
    .header {
      background: linear-gradient(135deg, #1A3BB3 0%, #4169E1 100%);
      padding: 32px 40px;
      text-align: center;
    }
    .header h1 { color: #fff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.3px; }
    .content { padding: 40px; text-align: center; }
    p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; }
    .btn-wrapper { margin: 32px 0; }
    .btn {
      display: inline-block;
      background-color: #2D5BE3;
      color: #fff !important;
      padding: 14px 36px;
      border-radius: 32px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
    }
    .footer { padding: 24px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header"><h1>Nimbus 2k26</h1></div>
      <div class="content">${body}</div>
      <div class="footer">&copy; 2026 Nimbus 2k26 — NIT Hamirpur &nbsp;|&nbsp; Do not reply to this email.</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends an account verification email.
 * @param {{ email: string, full_name: string }} user
 * @param {string} token - Short-lived JWT with { userId, email } payload
 */
export async function sendVerificationEmail(user, token) {
  const link = `${BACKEND_URL}/api/users/auth/verify-email?token=${token}`;

  const body = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 12px 0;">Confirm your email</h2>
    <p>Hi <strong>${user.full_name}</strong>, welcome to Nimbus 2k26!<br/>
    Click the button below to verify your email address and activate your account.</p>
    <div class="btn-wrapper">
      <a href="${link}" class="btn">Verify Email Address</a>
    </div>
    <p style="font-size:13px;color:#64748b;">
      This link expires in <strong>24 hours</strong>.<br/>
      If you didn't create an account, you can safely ignore this email.
    </p>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Nimbus 2k26" <${process.env.MAIL_USER}>`,
    to: user.email,
    subject: "Verify your Nimbus 2k26 account",
    html: wrapHtml("Verify Your Email", body),
  });
}

/**
 * Sends a password reset email.
 * @param {{ email: string, full_name: string }} user
 * @param {string} token - Short-lived JWT with { userId, email } payload
 */
export async function sendPasswordResetEmail(user, token) {
  const link = `${BACKEND_URL}/api/users/auth/reset-password?token=${token}`;

  const body = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 12px 0;">Reset your password</h2>
    <p>Hi <strong>${user.full_name}</strong>,<br/>
    We received a request to reset your Nimbus 2k26 password. Click the button below to set a new password.</p>
    <div class="btn-wrapper">
      <a href="${link}" class="btn">Reset Password</a>
    </div>
    <p style="font-size:13px;color:#64748b;">
      This link expires in <strong>1 hour</strong>.<br/>
      If you didn't request a password reset, you can safely ignore this email.
    </p>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Nimbus 2k26" <${process.env.MAIL_USER}>`,
    to: user.email,
    subject: "Reset your Nimbus 2k26 password",
    html: wrapHtml("Reset Password", body),
  });
}
