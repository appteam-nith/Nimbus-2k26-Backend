import dotenv from "dotenv";
dotenv.config();

import { signUp, login, verifyEmail } from "../src/controllers/emailAuthController.js";
import prisma from "../src/config/prisma.js";

// Mock Express req/res
function mockRes(resolve) {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    resolve({ status: res.statusCode, data });
  };
  res.send = (html) => {
    resolve({ status: res.statusCode, data: html });
  };
  return res;
}

async function runTests() {
  const testEmail = `test.auth.${Date.now()}@example.com`;
  const testPassword = "SecurePassword123!";

  console.log("=== EMAIL AUTHENTICATION INTEGRATION TEST ===");
  console.log(`Using test email: ${testEmail}`);

  try {
    // 1. Clean up existing test data if any
    await prisma.user.deleteMany({
      where: { email: { contains: "test.auth." } },
    });

    // 2. Test Sign Up
    console.log("\n[TEST] 1. Sign Up");
    const signUpResult = await new Promise((resolve) => {
      const req = { body: { name: "Test User", email: testEmail, password: testPassword } };
      signUp(req, mockRes(resolve));
    });
    
    if (signUpResult.status === 201) {
      console.log("✅ Sign Up succeeded (201)");
    } else {
      console.error("❌ Sign Up failed:", signUpResult.data);
      process.exit(1);
    }

    // 3. Test Login (Should fail with 403 Unverified)
    console.log("\n[TEST] 2. Login while Unverified");
    const unverifiedLogin = await new Promise((resolve) => {
      const req = { body: { email: testEmail, password: testPassword } };
      login(req, mockRes(resolve));
    });

    if (unverifiedLogin.status === 403) {
      console.log("✅ Blocked login correctly! User is unverified (403)");
    } else {
      console.error("❌ Expected 403 Unverified, but got:", unverifiedLogin);
      process.exit(1);
    }

    // 4. Manually mock an email verification by updating DB
    console.log("\n[TEST] 3. Simulating clicking verification link...");
    await prisma.user.update({
      where: { email: testEmail },
      data: { is_verified: true },
    });
    console.log("✅ Simulated successful verification in DB");

    // 5. Test Login (Should succeed)
    console.log("\n[TEST] 4. Login while Verified");
    const verifiedLogin = await new Promise((resolve) => {
      const req = { body: { email: testEmail, password: testPassword } };
      login(req, mockRes(resolve));
    });

    if (verifiedLogin.status === 200 && verifiedLogin.data.success) {
      console.log("✅ Login succeeded! Token received:", verifiedLogin.data.token.substring(0, 15) + "...");
    } else {
      console.error("❌ Expected 200 Success, but got:", verifiedLogin);
      process.exit(1);
    }

    // 6. Test Correct Password Requirement
    console.log("\n[TEST] 5. Login with Wrong Password");
    const wrongAuthLogin = await new Promise((resolve) => {
      const req = { body: { email: testEmail, password: "WrongPassword!!!" } };
      login(req, mockRes(resolve));
    });

    if (wrongAuthLogin.status === 401) {
      console.log("✅ Blocked login correctly for wrong password! (401)");
    } else {
      console.error("❌ Expected 401 Unauthorized, but got:", wrongAuthLogin);
      process.exit(1);
    }

    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉");

  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    console.log("\nCleaning up test user...");
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    console.log("Cleanup complete.");
    process.exit(0);
  }
}

runTests();
