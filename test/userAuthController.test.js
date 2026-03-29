import test from "node:test";
import assert from "node:assert/strict";
import { createEmailAuthControllers } from "../src/controllers/userAuthControllerFactory.js";
import { isAllowedCollegeEmail, isValidEmailFormat, normalizeEmail } from "../src/utils/authEmail.js";

const makeReq = (body = {}) => ({ body });

const makeRes = () => {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
};

const makeControllers = (overrides = {}) =>
  createEmailAuthControllers({
    createUser: async () => ({ user_id: "user-1" }),
    hashPassword: async (password) => `hashed:${password}`,
    comparePassword: async (password, hashedPassword) => hashedPassword === `hashed:${password}`,
    tokenGenerator: () => "signed-jwt",
    generateAndStoreOtp: () => "1234",
    clearStoredOtp: () => {},
    verifyOtp: () => true,
    grantEmailVerification: () => {},
    sendOtpEmail: async () => {},
    normalizeEmail,
    isValidEmailFormat,
    isAllowedCollegeEmail,
    ...overrides,
  });

test("sendOtp rejects non-college domains", async () => {
  const { sendOtp } = makeControllers();
  const res = makeRes();

  await sendOtp(makeReq({ email: "user@gmail.com" }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Only @nith.ac.in email addresses are allowed" });
});

test("sendOtp allows existing users because OTP is for verification, not registration", async () => {
  const { sendOtp } = makeControllers();
  const res = makeRes();

  await sendOtp(makeReq({ email: "24bcs047@nith.ac.in" }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Verification OTP sent successfully" });
});

test("sendOtp succeeds for valid nith email", async () => {
  let sentEmail = "";
  let sentOtp = "";
  const { sendOtp } = makeControllers({
    sendOtpEmail: async (email, otp) => {
      sentEmail = email;
      sentOtp = otp;
    },
  });
  const res = makeRes();

  await sendOtp(makeReq({ email: "24BCS047@NITH.AC.IN" }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Verification OTP sent successfully" });
  assert.equal(sentEmail, "24bcs047@nith.ac.in");
  assert.equal(sentOtp, "1234");
});

test("sendOtp clears OTP and returns 502 when email delivery fails", async () => {
  let clearedEmail = "";
  const { sendOtp } = makeControllers({
    clearStoredOtp: (email) => {
      clearedEmail = email;
    },
    sendOtpEmail: async () => {
      throw new Error("SMTP auth failed");
    },
  });
  const res = makeRes();

  await sendOtp(makeReq({ email: "24BCS047@NITH.AC.IN" }), res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "Failed to send OTP email" });
  assert.equal(clearedEmail, "24bcs047@nith.ac.in");
});

test("verifyEmailOtp rejects an invalid code", async () => {
  const { verifyEmailOtp } = makeControllers({
    verifyOtp: () => false,
  });
  const res = makeRes();

  await verifyEmailOtp(makeReq({ email: "24bcs047@nith.ac.in", otp: "9999" }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Invalid or expired OTP" });
});

test("verifyEmailOtp grants verification for a valid code", async () => {
  let grantedEmail = "";
  const { verifyEmailOtp } = makeControllers({
    grantEmailVerification: (email) => {
      grantedEmail = email;
    },
  });
  const res = makeRes();

  await verifyEmailOtp(makeReq({ email: "24BCS047@NITH.AC.IN", otp: "1234" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(grantedEmail, "24bcs047@nith.ac.in");
  assert.match(res.body.message, /Email verified successfully/i);
});

test("registerUser returns 410 because email/password registration is deprecated", async () => {
  const { registerUser } = makeControllers();
  const res = makeRes();

  await registerUser(makeReq({}), res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /Email\/password registration is no longer supported/i);
});

test("loginUser returns 410 because email/password login is deprecated", async () => {
  const { loginUser } = makeControllers();
  const res = makeRes();

  await loginUser(makeReq({}), res);

  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /Email\/password login is no longer supported/i);
});
