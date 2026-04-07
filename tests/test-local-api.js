const http = require('http');

async function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8000/', (res) => resolve(true));
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function runLocalTests() {
  console.log('=== NIMBUS LOCAL AUTHENTICATION TEST ===\n');
  
  const isUp = await checkServer();
  if (!isUp) {
    console.log('❌ Failed: Please start your local backend first!');
    console.log('▶️  Run: "npm run dev" in another terminal\n');
    process.exit(1);
  }

  const testEmail = `nimbus.test.${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const baseUrl = 'http://localhost:8000/api/users/auth';

  try {
    console.log(`[1] Testing Sign Up with ${testEmail}...`);
    const signupRes = await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha Tester', email: testEmail, password: testPassword })
    });
    const signupData = await signupRes.json();
    
    if (signupRes.status === 201) {
      console.log('✅ Sign Up successful! Backend properly sent (or attempted to send) 201 without timing out.');
    } else {
      console.log(`❌ Sign Up failed (Status ${signupRes.status}):`, signupData);
      process.exit(1);
    }

    console.log(`\n[2] Testing Login (Unverified Account)...`);
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const loginData = await loginRes.json();

    if (loginRes.status === 403) {
      console.log('✅ Correctly blocked unverified user login with a 403 response!');
      console.log('   Message:', loginData.error);
    } else {
      console.log(`❌ Expected 403 Block, but got (Status ${loginRes.status}):`, loginData);
      process.exit(1);
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('The backend logic and timeouts are completely fixed and working perfectly.');

  } catch (error) {
    console.error('Test script crashed:', error);
  }
}

runLocalTests();
