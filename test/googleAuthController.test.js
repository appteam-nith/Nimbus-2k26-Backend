import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleAuthController } from "../src/controllers/googleAuthControllerFactory.js";

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

const validPayload = {
  sub: "google-1",
  email: "24bcs047@nith.ac.in",
  name: "Gaurav",
  email_verified: true,
};

const validUser = {
  user_id: "user-1",
  full_name: "Gaurav",
  email: "24bcs047@nith.ac.in",
};

const makeController = (overrides = {}) =>
  createGoogleAuthController({
    googleClientId: "test-google-client-id",
    verifyIdToken: async () => validPayload,
    findUserByGoogleId: async () => null,
    findUserByEmail: async () => null,
    createGoogleUser: async () => validUser,
    tokenGenerator: () => "signed-jwt",
    ...overrides,
  });

test("returns 400 when idToken is missing", async () => {
  const controller = makeController();
  const res = makeRes();

  await controller(makeReq({}), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "idToken is required" });
});

test("returns 500 when GOOGLE_CLIENT_ID is missing", async () => {
  const controller = createGoogleAuthController({
    googleClientId: "",
    verifyIdToken: async () => validPayload,
    findUserByGoogleId: async () => null,
    findUserByEmail: async () => null,
    createGoogleUser: async () => validUser,
    tokenGenerator: () => "signed-jwt",
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Google authentication is not configured" });
});

test("rejects malformed payloads missing subject or email", async () => {
  const controller = makeController({
    verifyIdToken: async () => ({ email_verified: true }),
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Google authentication failed" });
});

test("rejects unverified Google emails", async () => {
  const controller = makeController({
    verifyIdToken: async () => ({
      ...validPayload,
      email_verified: false,
    }),
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Please verify your Google email before signing in" });
});

test("rejects non-college Google emails", async () => {
  const controller = makeController({
    verifyIdToken: async () => ({
      ...validPayload,
      email: "student@gmail.com",
    }),
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Only @nith.ac.in email addresses are allowed" });
});

test("returns 409 when a password account already exists for the email", async () => {
  const controller = makeController({
    findUserByEmail: async () => ({
      user_id: "local-1",
      email: "24bcs047@nith.ac.in",
      password: "hash",
    }),
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: "An account with this email already exists. Please log in with email/password.",
  });
});

test("logs in an existing Google user", async () => {
  const controller = makeController({
    findUserByGoogleId: async () => validUser,
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.token, "signed-jwt");
  assert.deepEqual(res.body.user, {
    id: "user-1",
    name: "Gaurav",
    email: "24bcs047@nith.ac.in",
  });
});

test("creates a new Google user with normalized email", async () => {
  let createdWithEmail = "";
  const controller = makeController({
    verifyIdToken: async () => ({
      ...validPayload,
      email: " 24BCS047@NITH.AC.IN ",
    }),
    createGoogleUser: async (name, email, googleId) => {
      createdWithEmail = email;
      return {
        user_id: "user-1",
        full_name: name,
        email,
        google_id: googleId,
      };
    },
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(createdWithEmail, "24bcs047@nith.ac.in");
});

test("recovers from duplicate create race", async () => {
  let googleLookupCount = 0;
  const controller = makeController({
    findUserByGoogleId: async () => {
      googleLookupCount += 1;
      return googleLookupCount >= 2 ? validUser : null;
    },
    createGoogleUser: async () => {
      const error = new Error("Unique constraint failed");
      error.code = "P2002";
      throw error;
    },
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test("returns 500 when token verification throws", async () => {
  const controller = makeController({
    verifyIdToken: async () => {
      throw new Error("Invalid token");
    },
  });
  const res = makeRes();

  await controller(makeReq({ idToken: "token" }), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Google authentication failed" });
});
