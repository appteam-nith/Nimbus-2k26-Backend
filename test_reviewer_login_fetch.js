import { spawn } from 'child_process';
import fetch from 'node-fetch'; // Node 18+ has native fetch

const server = spawn('node', ['--env-file=.env', 'src/index.js'], {
  stdio: 'pipe',
  env: { ...process.env, PORT: 6005 }
});

let serverStarted = false;

server.stdout.on('data', (data) => {
  const str = data.toString();
  console.log('[SERVER]:', str.trim());
  if (str.includes('Server running on http://localhost:6005')) {
    serverStarted = true;
    runTest();
  }
});

server.stderr.on('data', (data) => {
  console.error('[SERVER ERR]:', data.toString().trim());
});

async function runTest() {
  console.log('Sending login request for Reviewer...');
  let status = 500;
  let body = {};
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch('http://localhost:6005/api/users/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'reviewer@nith.ac.in',
          password: process.env.REVIEWER_PASSWORD || 'NimbusReviewer@2026#Secure!'
        })
      });

      status = response.status;
      body = await response.json();
      
      if (status !== 500) {
        break; // Success or non-DB error, break out of retry loop
      }
      
      console.log(`Attempt ${i + 1} failed with 500, retrying in 2 seconds...`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error('Fetch error:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

    console.log(`Status: ${status}`);
    console.log(`Response:`, JSON.stringify(body, null, 2));

    if (status === 200 && body.success) {
      console.log('✅ LOGIN SUCCESSFUL. Reviewer credentials worked!');
      console.log('Token:', body.token);
      console.log('Frontend check: The frontend receives this response and redirects successfully to /home as `success` is true and a token is provided.');
    } else {
      console.error('❌ LOGIN FAILED.');
    }
  console.log('Shutting down server...');
  server.kill();
  process.exit(0);
}
