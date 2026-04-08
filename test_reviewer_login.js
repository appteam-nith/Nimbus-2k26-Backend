import { spawn } from 'child_process';
import fetch from 'node-fetch'; // Requires node-fetch or Node 18+

const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || "reviewer@nith.ac.in";
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD || "NimbusReviewer@2026#Secure!";
const PORT = 6005;

console.log("=========================================");
console.log("🧪 TESTING REVIEWER LOGIN CREDENTIALS 🧪");
console.log("=========================================\n");

console.log("--> Starting temporary test server on port", PORT);

// Spawn the backend server locally on a dedicated test port
const server = spawn('node', ['--env-file=.env', 'src/index.js'], {
  stdio: 'pipe',
  env: { ...process.env, PORT }
});

let serverStarted = false;

server.stdout.on('data', (data) => {
  const str = data.toString();
  if (str.includes(`Server running on`)) {
    if (!serverStarted) {
      serverStarted = true;
      console.log("✅ Temporary server started successfully.\n");
      runTest();
    }
  }
});

server.stderr.on('data', (data) => {
  const errorOutput = data.toString().trim();
  // ignore harmless deprecation warnings if any
  if (errorOutput && !errorOutput.includes('DeprecationWarning')) {
      console.error('[SERVER ERR]:', errorOutput);
  }
});

async function attemptLogin() {
  let status = 500;
  let body = {};

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/users/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: REVIEWER_EMAIL,
          password: REVIEWER_PASSWORD
        })
      });

      status = response.status;
      body = await response.json();
      
      if (status !== 500) break;
      
      console.log(`[!] Attempt ${i + 1} failed with 500 (DB might be waking up). Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error('[!] Fetch error:', err.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { status, body };
}

async function runTest() {
  // --- FIRST LOGIN ---
  console.log(`\n--> [1/2] Sending FIRST login request for reviewer: ${REVIEWER_EMAIL}...`);
  const firstLogin = await attemptLogin();
  
  if (firstLogin.status === 200 && firstLogin.body.success) {
    console.log('✅ FIRST LOGIN PASSED!');
    console.log('Token provided:', firstLogin.body.token.substring(0, 30) + '...');
  } else {
    console.log('❌ FIRST LOGIN FAILED!');
    console.log('Response:', JSON.stringify(firstLogin.body, null, 2));
    server.kill();
    process.exit(1);
  }

  // --- LOGOUT SIMULATION ---
  console.log('\n--> [SIMULATING LOGOUT]');
  console.log('Discarding token on the client side...');
  await new Promise(r => setTimeout(r, 1000));

  // --- SECOND LOGIN ---
  console.log(`\n--> [2/2] Sending SECOND login request for reviewer: ${REVIEWER_EMAIL}...`);
  const secondLogin = await attemptLogin();

  console.log(`\n--- Final Server Response ---`);
  console.log(`Status code: ${secondLogin.status}`);
  console.log(`Response body:`, JSON.stringify(secondLogin.body, null, 2));
  console.log(`-----------------------\n`);

  if (secondLogin.status === 200 && secondLogin.body.success) {
    console.log('✅ TEST PASSED: Second login successful after simulated logout!');
    console.log('User object:', secondLogin.body.user);
  } else {
    console.log('❌ TEST FAILED: Second login was not successful.');
  }

  // Cleanup
  console.log('\n--> Shutting down temporary server...');
  server.kill();
  process.exit(secondLogin.status === 200 && secondLogin.body.success ? 0 : 1);
}

// Timeout failsafe
setTimeout(() => {
    if (!serverStarted) {
        console.error("❌ TEST FAILED: Server took too long to start.");
        server.kill();
        process.exit(1);
    }
}, 10000);
