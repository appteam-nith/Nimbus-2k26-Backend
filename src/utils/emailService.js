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

export { sendPasswordResetEmail };
