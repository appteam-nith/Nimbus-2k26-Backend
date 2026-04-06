const COLLEGE_EMAIL_DOMAIN = "@nith.ac.in";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Comma-separated list of reviewer / test emails that bypass the college-domain
// restriction. Set this only in your production env when submitting to Play Store.
// Example: REVIEWER_WHITELIST=reviewer@gmail.com,test@example.com
const REVIEWER_WHITELIST = new Set(
  (process.env.REVIEWER_WHITELIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

const isValidEmailFormat = (email) => EMAIL_REGEX.test(email);

const isAllowedCollegeEmail = (email) => {
  const normalized = normalizeEmail(email);
  // Allow explicitly whitelisted reviewer / demo accounts
  if (REVIEWER_WHITELIST.has(normalized)) return true;
  return normalized.endsWith(COLLEGE_EMAIL_DOMAIN);
};

export {
  COLLEGE_EMAIL_DOMAIN,
  REVIEWER_WHITELIST,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
};
