/**
 * In-memory OTP store for Nimbus 2k26.
 * In a production multi-server environment, this should be replaced with Redis or a DB table.
 * For this application, an in-memory Map is sufficient.
 */

const otpStore = new Map();
const verifiedEmailStore = new Map();

// OTP expiration time: 10 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const VERIFICATION_GRANT_EXPIRY_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_PURPOSE = "email_verification";

const otpKey = (email, purpose = EMAIL_VERIFICATION_PURPOSE) => `${purpose}:${email}`;

/**
 * Generates a 4-digit OTP and stores it for the given email.
 * @param {string} email
 * @returns {string} The generated 4-digit OTP
 */
export const generateAndStoreOtp = (email, purpose = EMAIL_VERIFICATION_PURPOSE) => {
    // Generate a random 4 digit number string from 1000 to 9999
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    otpStore.set(otpKey(email, purpose), {
        otp,
        expiresAt: Date.now() + OTP_EXPIRY_MS
    });

    return otp;
};

/**
 * Removes any stored OTP for the given email.
 * Useful when delivery fails after generating a code.
 * @param {string} email
 */
export const clearStoredOtp = (email, purpose = EMAIL_VERIFICATION_PURPOSE) => {
    otpStore.delete(otpKey(email, purpose));
};

/**
 * Verifies if the provided OTP matches the one stored for the given email.
 * If valid, it deletes the OTP to prevent reuse.
 * @param {string} email 
 * @param {string} inputOtp 
 * @returns {boolean} True if OTP is valid and unexpired
 */
export const verifyOtp = (email, inputOtp, purpose = EMAIL_VERIFICATION_PURPOSE) => {
    const key = otpKey(email, purpose);
    const data = otpStore.get(key);
    
    if (!data) {
        return false;
    }

    // Check expiration
    if (Date.now() > data.expiresAt) {
        otpStore.delete(key); // Cleanup
        return false;
    }

    // Check match
    if (data.otp === inputOtp) {
        otpStore.delete(key); // OTP consumed successfully
        return true;
    }

    return false;
};

/**
 * Grants a short-lived email-verification pass after OTP validation succeeds.
 * This is consumed by the Clerk sync endpoint.
 * @param {string} email
 */
export const grantEmailVerification = (email) => {
    verifiedEmailStore.set(email, {
        expiresAt: Date.now() + VERIFICATION_GRANT_EXPIRY_MS
    });
};

/**
 * Consumes the short-lived verification pass for the given email.
 * @param {string} email
 * @returns {boolean}
 */
export const consumeEmailVerificationGrant = (email) => {
    const data = verifiedEmailStore.get(email);

    if (!data) {
        return false;
    }

    if (Date.now() > data.expiresAt) {
        verifiedEmailStore.delete(email);
        return false;
    }

    verifiedEmailStore.delete(email);
    return true;
};

export { EMAIL_VERIFICATION_PURPOSE };
