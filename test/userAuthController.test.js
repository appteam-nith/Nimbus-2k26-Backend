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
    createUser: async (name, email, password) => ({ user_id: "user-1", full_name: name, email, password }),
    findUserByEmail: async () => null,
    hashPassword: async (password) => `hashed:${password}`,
    comparePassword: async (password, hashedPassword) => hashedPassword === `hashed:${password}`,
    tokenGenerator: () => "signed-jwt",
    generateAndStoreOtp: () => "1234",
    verifyOtp: () => true,
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
  assert.equal(sentEmail, "24bcs047@nith.ac.in");
  assert.equal(sentOtp, "1234");
});

test("registerUser rejects non-college domains", async () => {
  const { registerUser } = makeControllers();
  const res = makeRes();

  await registerUser(
    makeReq({ name: "Blocked", email: "blocked@gmail.com", password: "password123", otp: "1234" }),
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Only @nith.ac.in email addresses are allowed" });
});

test("registerUser rejects invalid otp", async () => {
  const { registerUser } = makeControllers({
    verifyOtp: () => false,
  });
  const res = makeRes();

  await registerUser(
    makeReq({ name: "Test User", email: "24bcs047@nith.ac.in", password: "password123", otp: "9999" }),
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Invalid or expired OTP" });
});

test("registerUser succeeds for valid nith email and otp", async () => {
  let createdUser;
  const { registerUser } = makeControllers({
    createUser: async (name, email, password) => {
      createdUser = { name, email, password };
      return { user_id: "user-1", full_name: name, email };
    },
  });
  const res = makeRes();

  await registerUser(
    makeReq({ name: "Test User", email: "24BCS047@NITH.AC.IN", password: "password123", otp: "1234" }),
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(createdUser, {
    name: "Test User",
    email: "24bcs047@nith.ac.in",
    password: "hashed:password123",
  });
});

test("loginUser rejects non-college domains", async () => {
  const { loginUser } = makeControllers();
  const res = makeRes();

  await loginUser(makeReq({ email: "blocked@gmail.com", password: "password123" }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Only @nith.ac.in email addresses are allowed" });
});

test("loginUser rejects google-only accounts for password login", async () => {
  const { loginUser } = makeControllers({
    findUserByEmail: async () => ({ user_id: "user-1", email: "24bcs047@nith.ac.in", password: null }),
  });
  const res = makeRes();

  await loginUser(makeReq({ email: "24bcs047@nith.ac.in", password: "password123" }), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "This account uses Google Sign-In. Please log in with Google." });
});

test("loginUser rejects invalid password", async () => {
  const { loginUser } = makeControllers({
    findUserByEmail: async () => ({ user_id: "user-1", email: "24bcs047@nith.ac.in", password: "hashed:other" }),
  });
  const res = makeRes();

  await loginUser(makeReq({ email: "24bcs047@nith.ac.in", password: "password123" }), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Invalid Password" });
});

test("loginUser succeeds for valid nith email and password", async () => {
  const { loginUser } = makeControllers({
    findUserByEmail: async () => ({ user_id: "user-1", email: "24bcs047@nith.ac.in", password: "hashed:password123" }),
  });
  const res = makeRes();

  await loginUser(makeReq({ email: "24BCS047@NITH.AC.IN", password: "password123" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.token, "signed-jwt");
});
