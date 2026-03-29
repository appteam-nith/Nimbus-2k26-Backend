/**
 * In-memory OTP store for Nimbus 2k26.
 * In a production multi-server environment this should be replaced with Redis.
 * For this application an in-memory Map is sufficient.
 */

const otpStore = new Map();

// OTP expiration time: 10 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Generates a 4-digit OTP and stores it for the given email.
 * @param {string} email
 * @returns {string} The generated 4-digit OTP
 */
export const generateAndStoreOtp = (email) => {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(email, {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });
  return otp;
};

/**
 * Verifies if the provided OTP matches the one stored for the given email.
 * Deletes the OTP on success to prevent reuse.
 * @param {string} email
 * @param {string} inputOtp
 * @returns {boolean} True if OTP is valid and unexpired
 */
export const verifyOtp = (email, inputOtp) => {
  const data = otpStore.get(email);

  if (!data) return false;

  if (Date.now() > data.expiresAt) {
    otpStore.delete(email);
    return false;
  }

  if (data.otp === inputOtp) {
    otpStore.delete(email);
    return true;
  }

  return false;
};
