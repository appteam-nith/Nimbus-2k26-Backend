/**
 * ============================================================
 *  Nimbus 2k26 Backend — Comprehensive API Test Suite
 *  Run: node test/api-test.js [--local]
 *  Requires Node 18+ (native fetch)
 * ============================================================
 *
 *  --local  flag uses http://localhost:3000 instead of live URL
 * ============================================================
 */

const BASE_URL = process.argv.includes('--local')
  ? 'http://localhost:3000'
  : 'https://nimbus-2k26-backend-olhw.onrender.com';

// ─── ANSI colours ────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

// ─── State shared across tests ───────────────────────────────
const state = {
  jwtToken: null,         // filled after a successful login
  testUserId: null,
  createdEventId: null,
  createdCoreTeamId: null,
};

// ─── Test tracking ───────────────────────────────────────────
const results = { passed: 0, failed: 0, skipped: 0, details: [] };

// ─── Helpers ─────────────────────────────────────────────────
function log(msg, colour = C.reset) {
  console.log(`${colour}${msg}${C.reset}`);
}

function section(title) {
  console.log(`\n${C.bold}${C.blue}${'─'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.blue}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.blue}${'─'.repeat(60)}${C.reset}`);
}

async function request(method, path, { body, token, headers = {} } = {}) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  try {
    const res = await fetch(url, opts);
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

function assert(testName, condition, details = '') {
  if (condition) {
    results.passed++;
    results.details.push({ name: testName, status: 'PASS' });
    log(`  ✓  ${testName}`, C.green);
  } else {
    results.failed++;
    results.details.push({ name: testName, status: 'FAIL', details });
    log(`  ✗  ${testName}`, C.red);
    if (details) log(`       ${details}`, C.gray);
  }
}

function skip(testName, reason) {
  results.skipped++;
  results.details.push({ name: testName, status: 'SKIP', details: reason });
  log(`  ⊘  ${testName}${reason ? ` — ${reason}` : ''}`, C.yellow);
}

function dumpResponse(label, { status, data, error }) {
  const statusColour = status >= 200 && status < 300 ? C.green : C.red;
  log(`     ${C.gray}${label} → ${statusColour}HTTP ${status}${C.gray} | ${JSON.stringify(data).slice(0, 120)}${C.reset}`, '');
}

// ─── TESTS ───────────────────────────────────────────────────

async function testHealthCheck() {
  section('1. HEALTH CHECK');
  const r = await request('GET', '/');
  dumpResponse('GET /', r);
  assert('Server is reachable (2xx or text response)', r.status !== 0 && r.status < 500,
    `Got HTTP ${r.status} | error: ${r.error || 'none'}`);
}

// ─── Public Auth Endpoints ────────────────────────────────────
async function testSendOtp() {
  section('2. POST /api/users/send-otp');

  // 2a. Missing email
  {
    const r = await request('POST', '/api/users/send-otp', { body: {} });
    dumpResponse('No email', r);
    assert('send-otp: 400 when email is missing',
      r.status === 400 && r.data?.error, `Got ${r.status}`);
  }

  // 2b. Invalid email format
  {
    const r = await request('POST', '/api/users/send-otp', { body: { email: 'not-an-email' } });
    dumpResponse('Invalid format', r);
    assert('send-otp: 400 for invalid email format',
      r.status === 400, `Got ${r.status}`);
  }

  // 2c. Non-college email
  {
    const r = await request('POST', '/api/users/send-otp', { body: { email: 'test@gmail.com' } });
    dumpResponse('Non-college email', r);
    assert('send-otp: 400/403 for non-@nith.ac.in email',
      r.status === 400 || r.status === 403, `Got ${r.status} | ${r.data?.error}`);
  }

  // 2d. Valid college email (OTP IS actually sent — may succeed or 400 if user exists)
  {
    const r = await request('POST', '/api/users/send-otp', { body: { email: 'test.nimbus@nith.ac.in' } });
    dumpResponse('Valid college email', r);
    assert('send-otp: responds with 200 or 400 (email already in use)',
      r.status === 200 || r.status === 400,
      `Got ${r.status} | ${JSON.stringify(r.data)}`);
  }
}

async function testRegisterUser() {
  section('3. POST /api/users/register');

  // 3a. Missing required fields — now returns 410 (deprecated endpoint)
  {
    const r = await request('POST', '/api/users/register', {
      body: { email: 'test@nith.ac.in' },
    });
    dumpResponse('Missing fields', r);
    assert('register: 410 (deprecated — password column removed)',
      r.status === 410, `Got ${r.status} | ${r.data?.error}`);
  }
}

async function testLoginUser() {
  section('4. POST /api/users/login');

  // 4a. Login is deprecated — returns 410
  {
    const r = await request('POST', '/api/users/login', { body: {} });
    dumpResponse('Deprecated login', r);
    assert('login: 410 (deprecated — password column removed)',
      r.status === 410, `Got ${r.status} | ${r.data?.error}`);
  }
}

async function testGoogleAuth() {
  section('5. POST /api/users/auth/google');

  // Now deprecated — returns 410 Gone
  {
    const r = await request('POST', '/api/users/auth/google', { body: {} });
    dumpResponse('Deprecated google-auth', r);
    assert('google-auth: 410 (deprecated — use Clerk)',
      r.status === 410, `Got ${r.status} | ${r.data?.error}`);
  }
}

// ─── Protected User Endpoints ─────────────────────────────────
async function testProtectedUserEndpoints() {
  section('6. PROTECTED USER ENDPOINTS (no token)');

  const endpoints = [
    ['POST', '/api/users/sync'],
    ['GET',  '/api/users/profile'],
    ['PUT',  '/api/users/profile'],
    ['PUT',  '/api/users/balance'],
  ];

  for (const [method, path] of endpoints) {
    const r = await request(method, path, { body: {} });
    dumpResponse(`${method} ${path}`, r);
    assert(`${method} ${path}: 401 without token`,
      r.status === 401, `Got ${r.status} | ${r.data?.error}`);
  }

  // ─── With JWT token (if captured) ──────────────────────────
  if (state.jwtToken) {
    section('7. PROTECTED USER ENDPOINTS (with JWT token)');

    // GET /profile
    {
      const r = await request('GET', '/api/users/profile', { token: state.jwtToken });
      dumpResponse('GET /profile', r);
      assert('GET /profile: 200 with valid JWT',
        r.status === 200 && r.data?.success, `Got ${r.status} | ${JSON.stringify(r.data)}`);
    }

    // PUT /profile
    {
      const r = await request('PUT', '/api/users/profile', {
        body: { name: 'Nimbus Test User' },
        token: state.jwtToken,
      });
      dumpResponse('PUT /profile', r);
      assert('PUT /profile: 200 with valid JWT',
        r.status === 200 && r.data?.success, `Got ${r.status} | ${JSON.stringify(r.data)}`);
    }

    // PUT /profile — missing name
    {
      const r = await request('PUT', '/api/users/profile', {
        body: {},
        token: state.jwtToken,
      });
      dumpResponse('PUT /profile (no name)', r);
      assert('PUT /profile: 400 when name missing',
        r.status === 400, `Got ${r.status}`);
    }

    // PUT /balance
    {
      const r = await request('PUT', '/api/users/balance', {
        body: { money: 100 },
        token: state.jwtToken,
      });
      dumpResponse('PUT /balance', r);
      assert('PUT /balance: 200 with valid JWT + money',
        r.status === 200 && r.data?.success, `Got ${r.status} | ${JSON.stringify(r.data)}`);
    }

    // PUT /balance — missing money
    {
      const r = await request('PUT', '/api/users/balance', {
        body: {},
        token: state.jwtToken,
      });
      dumpResponse('PUT /balance (no money)', r);
      assert('PUT /balance: 400 when money missing',
        r.status === 400, `Got ${r.status}`);
    }
  } else {
    section('7. PROTECTED USER ENDPOINTS (with JWT token)');
    skip('GET /profile with JWT', 'No JWT token — set TEST_EMAIL + TEST_PASSWORD');
    skip('PUT /profile with JWT', 'No JWT token — set TEST_EMAIL + TEST_PASSWORD');
    skip('PUT /balance with JWT', 'No JWT token — set TEST_EMAIL + TEST_PASSWORD');
  }

  // ─── Invalid token ─────────────────────────────────────────
  section('8. PROTECTED ENDPOINTS (invalid/expired token)');
  {
    const r = await request('GET', '/api/users/profile', { token: 'invalid.token.here' });
    dumpResponse('GET /profile (bad token)', r);
    assert('GET /profile: 401 with bad JWT',
      r.status === 401, `Got ${r.status} | ${r.data?.error}`);
  }
}

// ─── Events Endpoints ─────────────────────────────────────────
async function testEventsEndpoints() {
  section('9. EVENTS — GET /api/events');

  // 9a. All events
  {
    const r = await request('GET', '/api/events');
    dumpResponse('GET /api/events', r);
    assert('GET /api/events: 200 + data array',
      r.status === 200 && r.data?.data !== undefined,
      `Got ${r.status} | ${JSON.stringify(r.data).slice(0, 80)}`);

    // Capture first event ID for later
    if (Array.isArray(r.data?.data) && r.data.data.length > 0) {
      state.createdEventId = r.data.data[0].event_id ?? r.data.data[0].id;
    }
  }

  // 9b. Filter by date
  {
    const r = await request('GET', '/api/events?date=2026-04-10');
    dumpResponse('GET /api/events?date=2026-04-10', r);
    assert('GET /api/events?date: 200',
      r.status === 200, `Got ${r.status}`);
  }

  // 9c. Invalid date format
  {
    const r = await request('GET', '/api/events?date=not-a-date');
    dumpResponse('GET /api/events?date=not-a-date', r);
    assert('GET /api/events?date (invalid): 400 or empty data',
      r.status === 400 || (r.status === 200 && Array.isArray(r.data?.data)),
      `Got ${r.status}`);
  }

  // 9d. Specific event by ID
  if (state.createdEventId) {
    const r = await request('GET', `/api/events/${state.createdEventId}`);
    dumpResponse(`GET /api/events/${state.createdEventId}`, r);
    assert('GET /api/events/:id: 200 with event data',
      r.status === 200 && r.data?.data !== undefined, `Got ${r.status}`);
  } else {
    skip('GET /api/events/:id', 'No events in DB or ID not captured');
  }

  // 9e. Non-existent event ID
  {
    const r = await request('GET', '/api/events/999999999');
    dumpResponse('GET /api/events/999999999', r);
    assert('GET /api/events/:id (not found): 404',
      r.status === 404, `Got ${r.status}`);
  }

  // 9f. Create event (POST)
  section('10. EVENTS — POST /api/events');
  {
    const payload = {
      event_name: 'API Test Event',
      venue: 'Test Venue',
      event_time: '2026-04-10T10:00:00.000Z',
      organizing_club_id: 1,
      description: 'Created by API test script',
      day: 1,
    };
    const r = await request('POST', '/api/events', { body: payload });
    dumpResponse('POST /api/events', r);
    assert('POST /api/events: 201 with created event',
      r.status === 201 && r.data?.data !== undefined,
      `Got ${r.status} | ${JSON.stringify(r.data).slice(0, 120)}`);

    if (r.status === 201 && r.data?.data) {
      state.createdEventId = r.data.data.event_id ?? r.data.data.id;
      log(`     ${C.cyan}Created event ID: ${state.createdEventId}${C.reset}`, '');
    }
  }

  // 9g. POST /api/events — missing required fields
  {
    const r = await request('POST', '/api/events', { body: { event_name: 'Incomplete' } });
    dumpResponse('POST /api/events (incomplete)', r);
    assert('POST /api/events: 400/500 for missing required fields',
      r.status === 400 || r.status === 500, `Got ${r.status}`);
  }
}

// ─── Core Team Endpoints ──────────────────────────────────────
async function testCoreTeamEndpoints() {
  section('11. CORE TEAM — GET /api/coreteam');

  // 11a. Get all
  {
    const r = await request('GET', '/api/coreteam');
    dumpResponse('GET /api/coreteam', r);
    assert('GET /api/coreteam: 200 + data array',
      r.status === 200 && r.data?.success === true,
      `Got ${r.status} | ${JSON.stringify(r.data).slice(0, 80)}`);

    if (Array.isArray(r.data?.data) && r.data.data.length > 0) {
      state.createdCoreTeamId = r.data.data[r.data.data.length - 1].id;
    }
  }

  // 11b. Add member
  section('12. CORE TEAM — POST /api/coreteam');
  {
    const r = await request('POST', '/api/coreteam', {
      body: {
        name: 'API Test Member',
        role: 'Tester',
        image_url: 'https://example.com/avatar.png',
        linkedin: 'https://linkedin.com/in/test',
      },
    });
    dumpResponse('POST /api/coreteam', r);
    assert('POST /api/coreteam: 201 with member data',
      r.status === 201 && r.data?.success === true,
      `Got ${r.status} | ${JSON.stringify(r.data).slice(0, 120)}`);

    if (r.status === 201 && r.data?.data) {
      state.createdCoreTeamId = r.data.data.id;
      log(`     ${C.cyan}Created member ID: ${state.createdCoreTeamId}${C.reset}`, '');
    }
  }

  // 11c. POST — missing required fields (name / role)
  {
    const r = await request('POST', '/api/coreteam', { body: { linkedin: 'https://linkedin.com' } });
    dumpResponse('POST /api/coreteam (missing fields)', r);
    assert('POST /api/coreteam: 400 when name/role missing',
      r.status === 400 || r.status === 500, `Got ${r.status}`);
  }

  // 11d. Delete specific member
  section('13. CORE TEAM — DELETE /api/coreteam/:id');
  if (state.createdCoreTeamId) {
    const r = await request('DELETE', `/api/coreteam/${state.createdCoreTeamId}`);
    dumpResponse(`DELETE /api/coreteam/${state.createdCoreTeamId}`, r);
    assert('DELETE /api/coreteam/:id: 200',
      r.status === 200 && r.data?.success === true,
      `Got ${r.status} | ${r.data?.error}`);
  } else {
    skip('DELETE /api/coreteam/:id', 'No member ID to delete');
  }

  // 11e. Delete non-existent member
  {
    const r = await request('DELETE', '/api/coreteam/99999999-0000-0000-0000-000000000000');
    dumpResponse('DELETE /api/coreteam/nonexistent', r);
    assert('DELETE /api/coreteam/:id: 404 for non-existent member',
      r.status === 404, `Got ${r.status}`);
  }
}

// ─── Events via User Route ────────────────────────────────────
async function testUserEventsRoute() {
  section('14. USER — GET /api/users/events?date=YYYY-MM-DD');

  // Valid date
  {
    const r = await request('GET', '/api/users/events?date=2026-04-10');
    dumpResponse('GET /api/users/events?date=2026-04-10', r);
    assert('GET /api/users/events (valid date): 200',
      r.status === 200, `Got ${r.status}`);
  }

  // Missing date → middleware should reject
  {
    const r = await request('GET', '/api/users/events');
    dumpResponse('GET /api/users/events (no date)', r);
    assert('GET /api/users/events (no date): 400',
      r.status === 400, `Got ${r.status}`);
  }
}

// ─── Summary ─────────────────────────────────────────────────
function printSummary() {
  const total = results.passed + results.failed + results.skipped;
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  TEST SUMMARY${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`  ${C.green}Passed :${C.reset}  ${results.passed}`);
  console.log(`  ${C.red}Failed :${C.reset}  ${results.failed}`);
  console.log(`  ${C.yellow}Skipped:${C.reset}  ${results.skipped}`);
  console.log(`  Total  :  ${total}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}\n`);

  if (results.failed > 0) {
    log('  Failed tests:', C.red);
    results.details
      .filter(d => d.status === 'FAIL')
      .forEach(d => {
        log(`   ✗ ${d.name}`, C.red);
        if (d.details) log(`     ${d.details}`, C.gray);
      });
    console.log('');
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.magenta}  Nimbus 2k26 Backend — API Test Suite${C.reset}`);
  console.log(`${C.gray}  Target : ${BASE_URL}${C.reset}`);
  console.log(`${C.gray}  Time   : ${new Date().toISOString()}${C.reset}\n`);

  if (process.env.TEST_EMAIL) {
    log(`  Using test account: ${process.env.TEST_EMAIL}`, C.cyan);
  } else {
    log('  ⚠  TEST_EMAIL / TEST_PASSWORD not set — protected-route tests will be skipped.', C.yellow);
    log('     Set them before running:  TEST_EMAIL=x@nith.ac.in TEST_PASSWORD=pass node test/api-test.js', C.gray);
  }

  try {
    await testHealthCheck();
    await testSendOtp();
    await testRegisterUser();
    await testLoginUser();
    await testGoogleAuth();
    await testProtectedUserEndpoints();
    await testEventsEndpoints();
    await testCoreTeamEndpoints();
    await testUserEventsRoute();
  } catch (err) {
    log(`\n  FATAL: ${err.message}`, C.red);
    console.error(err);
  }

  printSummary();
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
