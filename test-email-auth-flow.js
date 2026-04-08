 /**
 * Test Script for Email Authentication Flow
 * This script tests the complete email authentication flow including:
 * - Reviewer login
 * - Regular user signup and verification
 * - Password reset functionality
 */

const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const { sign } = require('jsonwebtoken');
const prisma = require('./prisma').default;

// Environment variables
const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || "reviewer@nith.ac.in";
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD || "NimbusReviewer@2026#Secure!";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Base URL for backend (adjust if needed)
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testReviewerLogin() {
  console.log("\n=== Testing Reviewer Login ===");
  
  try {
    // Step 1: Login with reviewer credentials
    const loginResponse = await fetch(`${BASE_URL}/api/users/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: REVIEWER_EMAIL,
        password: REVIEWER_PASSWORD
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (loginResponse.status === 200 && loginData.token) {
      console.log(`✓ Reviewer login successful! Token: ${loginData.token.substring(0, 30)}...`);
      
      // Step 2: Verify token works
      const verifyResponse = await fetch(`${BASE_URL}/api/users/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${loginData.token}`
        }
      });
      
      const verifyData = await verifyResponse.json();
      if (verifyResponse.status === 200) {
        console.log(`✓ Reviewer profile access successful! User: ${verifyData.user?.full_name || verifyData.user?.name}`);
      } else {
        console.warn(`✗ Failed to access profile with token: ${verifyData.error}`);
      }
      
      return true;
    } else {
      console.warn(`✗ Reviewer login failed: ${loginData.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error during reviewer login: ${error.message}`);
    return false;
  }
}

async function testRegularUserSignupAndLogin() {
  console.log("\n=== Testing Regular User Signup & Login ===");
  
  const testEmail = `test.user+${Date.now()}@nith.ac.in`;
  const testName = "Test User";
  const testPassword = "TestPass123!";
  
  try {
    // Step 1: Signup
    const signupResponse = await fetch(`${BASE_URL}/api/users/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword
      })
    });
    
    const signupData = await signupResponse.json();
    
    if (signupResponse.status === 201) {
      console.log(`✓ User signed up successfully! Need to verify email...`);
      
      // Find user in database to get verification status
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      if (user) {
        console.log(`  - User ID: ${user.user_id}`);
        console.log(`  - Is verified: ${user.is_verified}`);
        
        if (!user.is_verified) {
          console.log("  - Need to verify email...");
          
          // Generate verification token
          const token = sign({ userId: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
          
          // Verify email endpoint
          const verifyResponse = await fetch(`${BASE_URL}/api/users/auth/verify-email`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (verifyResponse.status === 200) {
            console.log(`✓ Email verification successful!`);
            
            // Try to login now
            const loginResponse = await fetch(`${BASE_URL}/api/users/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: testEmail,
                password: testPassword
              })
            });
            
            const loginData = await loginResponse.json();
            if (loginResponse.status === 200 && loginData.token) {
              console.log(`✓ Login successful after verification!`);
              
              // Clean up - delete test user
              await prisma.user.delete({ where: { email: testEmail } });
              console.log(`✓ Test user cleaned up`);
              
              return true;
            } else {
              console.warn(`✗ Login failed after verification: ${loginData.error}`);
              return false;
            }
          } else {
            console.warn(`✗ Email verification failed`);
            return false;
          }
        } else {
          console.log(`  - User already verified, proceeding to login...`);
          const loginResponse = await fetch(`${BASE_URL}/api/users/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: testEmail,
              password: testPassword
            })
          });
          
          const loginData = await loginResponse.json();
          if (loginResponse.status === 200 && loginData.token) {
            console.log(`✓ Login successful!`);
            await prisma.user.delete({ where: { email: testEmail } });
            console.log(`✓ Test user cleaned up`);
            return true;
          } else {
            console.warn(`✗ Login failed: ${loginData.error}`);
            return false;
          }
        }
      }
    } else {
      console.warn(`✗ Signup failed: ${signupData.error}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error during user signup/login: ${error.message}`);
    return false;
  }
}

async function testPasswordReset() {
  console.log("\n=== Testing Password Reset Flow ===");
  
  const testEmail = `reset.test+${Date.now()}@nith.ac.in`;
  const testName = "Reset Test";
  const testPassword = "OriginalPass123!";
  const newPassword = "NewPass456!";
  
  try {
    // Create test user
    const password_hash = await bcrypt.hash(testPassword, 12);
    const user = await prisma.user.create({
      data: {
        full_name: testName,
        email: testEmail,
        password_hash,
        is_verified: true
      }
    });
    
    console.log(`✓ Test user created with verified status`);
    
    // Step 1: Request password reset
    const forgotResponse = await fetch(`${BASE_URL}/api/users/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    
    if (forgotResponse.status === 200) {
      console.log(`✓ Password reset email requested (always returns 200)`);
    }
    
    // Step 2: Get user and generate reset token
    const dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    const token = sign({ userId: dbUser.user_id, email: dbUser.email }, JWT_SECRET, { expiresIn: '1h' });
    
    // Step 3: Reset password
    const resetResponse = await fetch(`${BASE_URL}/api/users/auth/reset-password?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPassword })
    });
    
    const resetData = await resetResponse.json();
    
    if (resetResponse.status === 200) {
      console.log(`✓ Password reset successful!`);
      
      // Step 4: Verify with new password
      const loginResponse = await fetch(`${BASE_URL}/api/users/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: newPassword
        })
      });
      
      const loginData = await loginResponse.json();
      if (loginResponse.status === 200 && loginData.token) {
        console.log(`✓ Login with new password successful!`);
      } else {
        console.warn(`✗ Login with new password failed: ${loginData.error}`);
      }
      
      // Clean up
      await prisma.user.delete({ where: { email: testEmail } });
      console.log(`✓ Test user cleaned up`);
      
      return true;
    } else {
      console.warn(`✗ Password reset failed: ${resetData.error}`);
      return false;
    }
  } catch (error) {
    console.error(`✗ Error during password reset: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("Starting Email Authentication Flow Tests...\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Reviewer Email: ${REVIEWER_EMAIL}`);
  console.log(`Reviewer Password: ${REVIEWER_PASSWORD ? "SET" : "NOT SET"}`);
  
  // Ensure backend is running
  try {
    const healthResponse = await fetch(BASE_URL);
    if (healthResponse.status === 200) {
      console.log("\n✓ Backend is reachable and running");
    } else {
      console.log(`\n✗ Backend returned status ${healthResponse.status}`);
    }
  } catch (error) {
    console.log("\n✗ Backend is not reachable. Please start the server first.");
    console.log("  Run: npm run dev (from backend directory)");
    return;
  }
  
  let allTestsPassed = true;
  
  // Test 1: Reviewer Login
  const reviewerTest = await testReviewerLogin();
  if (reviewerTest) {
    console.log("\n✓ Reviewer login test PASSED");
  } else {
    console.log("\n✗ Reviewer login test FAILED");
    allTestsPassed = false;
  }
  
  // Test 2: Regular User Signup & Login
  const userTest = await testRegularUserSignupAndLogin();
  if (userTest) {
    console.log("\n✓ Regular user signup/login test PASSED");
  } else {
    console.log("\n✗ Regular user signup/login test FAILED");
    allTestsPassed = false;
  }
  
  // Test 3: Password Reset
  const resetTest = await testPasswordReset();
  if (resetTest) {
    console.log("\n✓ Password reset test PASSED");
  } else {
    console.log("\n✗ Password reset test FAILED");
    allTestsPassed = false;
  }
  
  console.log("\n" + "=".repeat(50));
  if (allTestsPassed) {
    console.log("✅ ALL TESTS PASSED ✓");
  } else {
    console.log("❌ SOME TESTS FAILED");
  }
  console.log("=".repeat(50));
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run the tests
main().catch(console.error);