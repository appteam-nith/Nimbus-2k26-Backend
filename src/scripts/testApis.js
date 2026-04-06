/**
 * Nimbus-2k26-Backend - API Test Script
 * Run with: node src/scripts/testApis.js
 * Requires dev server to be running on PORT 3000.
 */

const BASE_URL = "http://localhost:3000/api";

let passed = 0;
let failed = 0;
let authToken = "";
let createdMemberId = null;
let resetToken = "";

// Helpers
const log = (label, ok, status, body) => {
  const badge = ok ? "PASS" : "FAIL";
  console.log(`\n[${badge}] ${label}`);
  console.log(`  Status: ${status}`);
  console.log(`  Body  : ${JSON.stringify(body).slice(0, 250)}`);
  ok ? passed++ : failed++;
};

const api = async (method, path, body, token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, json };
};

const testTimestamp = Date.now();
const testEmail = `testuser_${testTimestamp}@nimbus.test`;
const testPassword = "TestPass@123";

async function runTests() {
  console.log("============================================================");
  console.log("  Nimbus-2k26 Backend API Tests");
  console.log("============================================================");

  // 1. Register new user
  {
    const { status, json } = await api("POST", "/users/register", {
      name: "Test User", email: testEmail, password: testPassword,
    });
    log("POST /users/register", status === 201 && json.success, status, json);
  }

  // 2. Duplicate register (should fail 400)
  {
    const { status, json } = await api("POST", "/users/register", {
      name: "Test User", email: testEmail, password: testPassword,
    });
    log("POST /users/register (duplicate)", status === 400, status, json);
  }

  // 3. Login
  {
    const { status, json } = await api("POST", "/users/login", {
      email: testEmail, password: testPassword,
    });
    log("POST /users/login", status === 200 && !!json.token, status, json);
    if (json.token) authToken = json.token;
  }

  // 4. Login wrong password
  {
    const { status, json } = await api("POST", "/users/login", {
      email: testEmail, password: "WrongPassword",
    });
    log("POST /users/login (wrong password)", status === 401, status, json);
  }

  // 5. Get profile (authenticated)
  {
    const { status, json } = await api("GET", "/users/profile", null, authToken);
    log("GET /users/profile (authenticated)", status === 200 && json.success, status, json);
  }

  // 6. Get profile (no token)
  {
    const { status, json } = await api("GET", "/users/profile", null, null);
    log("GET /users/profile (no token)", status === 401, status, json);
  }

  // 7. Update profile
  {
    const { status, json } = await api("PUT", "/users/profile", { name: "Updated User" }, authToken);
    log("PUT /users/profile", status === 200 && json.success, status, json);
  }

  // 8. Forgot password
  {
    const { status, json } = await api("POST", "/users/forgot-password", { email: testEmail });
    log("POST /users/forgot-password", status === 200 && json.success, status, json);
    if (json.resetToken) resetToken = json.resetToken;
  }

  // 9. Reset password (valid token)
  if (resetToken) {
    const { status, json } = await api("POST", "/users/reset-password", {
      token: resetToken, newPassword: "NewPass@456",
    });
    log("POST /users/reset-password (valid)", status === 200 && json.success, status, json);
  } else {
    console.log("\n[SKIP] POST /users/reset-password - no token from step 8");
    failed++;
  }

  // 10. Reset password (invalid token)
  {
    const { status, json } = await api("POST", "/users/reset-password", {
      token: "invalidtoken123", newPassword: "NewPass@456",
    });
    log("POST /users/reset-password (invalid)", status === 400, status, json);
  }

  // -- Core Team --

  // 11. GET core team
  {
    const { status, json } = await api("GET", "/coreteam");
    log("GET /coreteam", status === 200 && json.success, status, json);
  }

  // 12. Add core team member
  {
    const { status, json } = await api("POST", "/coreteam", {
      name: "Test Member", role: "Backend Dev",
    });
    log("POST /coreteam", status === 201 && json.success, status, json);
    if (json.data?.id) createdMemberId = json.data.id;
  }

  // 13. Add core team member (missing role)
  {
    const { status, json } = await api("POST", "/coreteam", { name: "Incomplete" });
    log("POST /coreteam (missing role)", status === 400, status, json);
  }

  // 14. Delete core team member
  if (createdMemberId) {
    const { status, json } = await api("DELETE", `/coreteam/${createdMemberId}`);
    log(`DELETE /coreteam/${createdMemberId}`, status === 200 && json.success, status, json);
  } else {
    console.log("\n[SKIP] DELETE /coreteam/:id - no member created in step 12");
    failed++;
  }

  // 15. Delete non-existent member
  {
    const { status, json } = await api("DELETE", "/coreteam/999999");
    log("DELETE /coreteam/999999 (not found)", status === 404, status, json);
  }

  // Summary
  console.log("\n============================================================");
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log("============================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("\n[ERROR] Test runner crashed:", err.message);
  process.exit(1);
});
