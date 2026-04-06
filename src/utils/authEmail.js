const COLLEGE_EMAIL_DOMAIN = "@nith.ac.in";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }

  return email.trim().toLowerCase();
};

const isValidEmailFormat = (email) => EMAIL_REGEX.test(email);

const isAllowedCollegeEmail = (email) => normalizeEmail(email).endsWith(COLLEGE_EMAIL_DOMAIN);

export {
  COLLEGE_EMAIL_DOMAIN,
  normalizeEmail,
  isValidEmailFormat,
  isAllowedCollegeEmail,
};
