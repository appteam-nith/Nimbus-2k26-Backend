import nodemailer from "nodemailer";

/**
 * Email service using authkey.io Transactional Email API.
 * Docs: https://authkey.io/docs/
 *
 * Required .env variables:
 *   AUTHKEY        — your authkey.io API key
 *   EMAIL_TEMPLATE_ID — template `mid` configured on authkey.io dashboard
 *   FRONTEND_URL   — base URL of your frontend (used in reset link)
 */

const AUTHKEY_API = "https://console.authkey.io/request";

/**
 * Low-level helper — calls the authkey.io API.
 * @param {object} params - Query params to send.
 * @returns {Promise<object>} Parsed JSON response.
 */
const callAuthkeyApi = async (params) => {
  const url = new URL(AUTHKEY_API);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), { method: "GET" });

  // authkey returns 200 even on failures — parse body to detect errors
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.type === "error") {
    throw new Error(
      `authkey.io error: ${data?.message || response.statusText}`
    );
  }

  return data;
};

const createTransporter = () => {
  return nodemailer.createTransport({
    // Using Brevo SMTP Relay by default, or relying on generic SMTP config
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Sends a password reset email via authkey.io.
 *
 * On the authkey.io dashboard:
 *   1. Go to Email → Template → create a template.
 *   2. Use {{reset_link}} as a variable inside the template body.
 *   3. Copy the template's `mid` and set it as EMAIL_TEMPLATE_ID in .env.
 *
 * @param {string} toEmail    - Recipient email address.
 * @param {string} resetToken - The plain reset token.
 */
const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const authkey = process.env.AUTHKEY;
  const mid = process.env.EMAIL_TEMPLATE_ID;

  if (!authkey) throw new Error("AUTHKEY is not set in environment variables");
  if (!mid) throw new Error("EMAIL_TEMPLATE_ID is not set in environment variables");

  const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

  await callAuthkeyApi({
    authkey,
    email: toEmail,
    mid,
    // Pass the reset link as a template variable (replace {{reset_link}} in your authkey template)
    reset_link: resetLink,
  });
};

/**
 * Sends a 4-digit OTP to the user for registration
 * @param {string} toEmail 
 * @param {string} otp 
 */
const sendOtpEmail = async (toEmail, otp) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"Nimbus 2k26" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Registration OTP — Nimbus 2k26",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Welcome to Nimbus 2k26!</h2>
        <p>Hi there,</p>
        <p>You recently tried to register an account with us. To verify your email, please enter the following 4-digit OTP code in the app:</p>
        <div style="text-align: center; margin: 32px 0;">
          <span style="display: inline-block; letter-spacing: 6px; padding: 16px 32px; background-color: #f3f4f6; color: #111827; border-radius: 6px; font-size: 32px; font-weight: bold;">
            ${otp}
          </span>
        </div>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
        <p style="font-size: 13px; color: #999;">If you did not request this OTP, please ignore this email. No account will be created.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export { sendPasswordResetEmail, sendOtpEmail };
