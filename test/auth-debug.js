/**
 * ============================================================
 *  Nimbus 2k26 Backend — Auth Diagnostics Script
 *  Run: node test/auth-debug.js [--local]
 *
 *  Deeply probes all auth-related endpoints to surface errors.
 * ============================================================
 */

const BASE_URL = process.argv.includes('--local')
  ? 'http://localhost:3000'
  : 'https://nimbus-2k26-backend-olhw.onrender.com';

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  blue:   '\x1b[34m',
};

const issues = [];

function recordIssue(title, detail) {
  issues.push({ title, detail });
  console.log(`\n  ${C.red}⚠ ISSUE: ${title}${C.reset}`);
  console.log(`  ${C.gray}${detail}${C.reset}`);
}

function assert(title, condition, failDetail) {
  if (condition) {
    console.log(`  ${C.green}✓ ${title}${C.reset}`);
  } else {
    recordIssue(title, failDetail);
  }
}

function ok(title) {
  console.log(`  ${C.green}✓ ${title}${C.reset}`);
}

function info(msg) {
  console.log(`  ${C.cyan}ℹ ${msg}${C.reset}`);
}

function header(msg) {
  console.log(`\n${C.bold}${C.blue}── ${msg} ${'─'.repeat(Math.max(0, 55 - msg.length))}${C.reset}`);
}

async function req(method, path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const start = Date.now();
  try {
    const fetchOpts = { method, headers };
    // Never add body to GET/HEAD requests
    if (opts.body && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, fetchOpts);
    const ms = Date.now() - start;
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    console.log(`  ${C.gray}[${method} ${path}] → HTTP ${res.status} (${ms}ms)${C.reset}`);
    console.log(`  ${C.gray}Response: ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}${C.reset}`);
    return { status: res.status, data };
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`  ${C.red}[${method} ${path}] → NETWORK ERROR (${ms}ms): ${err.message}${C.reset}`);
    return { status: 0, data: null, error: err.message };
  }
}

// ─── Tests ────────────────────────────────────────────────────

async function checkServerReachability() {
  header('Server Reachability');
  const r = await req('GET', '/');
  if (r.status === 0) {
    recordIssue('Server unreachable', `Cannot connect to ${BASE_URL}. Is the server running?`);
    return false;
  }
  ok(`Server responded with HTTP ${r.status}`);
  return true;
}

async function diagnoseSendOtp() {
  header('POST /api/users/send-otp — Validation checks');

  // 1. Empty body
  {
    const r = await req('POST', '/api/users/send-otp', { body: {} });
    assert('Empty body → 400', r.status === 400, `Got HTTP ${r.status}. Missing email not validated.`);
  }

  // 2. Invalid email format
  {
    const r = await req('POST', '/api/users/send-otp', { body: { email: 'randomstring' } });
    assert('Invalid format → 400', r.status === 400, `Got HTTP ${r.status}. Email format not validated.`);
  }

  // 3. Non-college email
  {
    const r = await req('POST', '/api/users/send-otp', { body: { email: 'user@gmail.com' } });
    assert('Non-college email → 400/403', r.status === 400 || r.status === 403,
      `Got HTTP ${r.status}. College restriction not enforced.`);
  }

  // 4. Valid college email
  {
    const r = await req('POST', '/api/users/send-otp', { body: { email: 'testuser.nimbus@nith.ac.in' } });
    if (r.status === 200) {
      ok('Valid college email → 200 ✓ (OTP sent)');
    } else if (r.status === 400 && r.data?.error?.toLowerCase().includes('already')) {
      info('Valid college email → 400 (email already in use — expected for existing accounts)');
    } else {
      recordIssue('send-otp: valid college email should return 200 or 400 (existing user)',
        `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
    }
  }

  // 5. GET on POST-only route → 404 (expected)
  {
    const r = await req('GET', '/api/users/send-otp');
    if (r.status === 404) {
      info('GET /api/users/send-otp → 404 (expected — route is POST only ✓)');
    }
  }
}

async function diagnoseLogin() {
  header('POST /api/users/login — Deprecation check');

  const r = await req('POST', '/api/users/login', { body: {} });
  assert('login returns 410 (deprecated — password column removed)',
    r.status === 410,
    `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
}

async function diagnoseRegister() {
  header('POST /api/users/register — Deprecation check');

  const r = await req('POST', '/api/users/register', { body: {} });
  assert('register returns 410 (deprecated — password column removed)',
    r.status === 410,
    `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
}

async function diagnoseGoogleAuth() {
  header('POST /api/users/auth/google — Deprecation check');

  const r = await req('POST', '/api/users/auth/google', { body: {} });
  assert('google-auth returns 410 (deprecated — use Clerk)',
    r.status === 410,
    `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
}

async function diagnoseClerkMiddleware() {
  header('Clerk middleware — Global clerkMiddleware() check');

  info('Sending garbage Authorization header to check middleware robustness...');
  const r = await req('GET', '/api/users/profile', {
    headers: { Authorization: 'Bearer Clerk.invalid.session.token.xyz' },
  });

  if (r.status === 0) {
    recordIssue('Clerk middleware: server crashed (network error / no response)',
      'Server may be throwing an unhandled error from clerkMiddleware() on bad tokens.');
  } else if (r.status >= 500) {
    recordIssue('Clerk middleware: returns 5xx for invalid Clerk token',
      `Got HTTP ${r.status}: ${JSON.stringify(r.data)}.\n` +
      'clerkMiddleware() may not be handling errors. Check CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.');
  } else {
    ok(`Clerk middleware handled invalid token gracefully → HTTP ${r.status} ✓`);
  }

  info('Testing hybrid auth fallback: truly malformed JWT...');
  const r2 = await req('GET', '/api/users/profile', { token: 'totally.invalid.jwt' });
  if (r2.status === 0) {
    recordIssue('Hybrid auth: network error on malformed JWT', `Error: ${r2.error}`);
  } else if (r2.status === 401) {
    ok('Hybrid auth fallback: malformed JWT → 401 ✓');
  } else {
    recordIssue('Hybrid auth: malformed JWT not properly rejected',
      `Expected 401, got HTTP ${r2.status}: ${JSON.stringify(r2.data)}`);
  }
}

async function diagnoseProtectedRoutes() {
  header('Protected routes — Auth middleware checks');

  const protectedEndpoints = [
    { method: 'POST', path: '/api/users/sync',    hasBody: true  },
    { method: 'GET',  path: '/api/users/profile', hasBody: false },
    { method: 'PUT',  path: '/api/users/profile', hasBody: true  },
    { method: 'PUT',  path: '/api/users/balance', hasBody: true  },
  ];

  for (const { method, path, hasBody } of protectedEndpoints) {
    // No token
    {
      const r = await req(method, path, hasBody ? { body: {} } : {});
      if (r.status === 0) {
        recordIssue(`${method} ${path}: network error`, `Error: ${r.error}`);
      } else {
        assert(`${method} ${path} — No token → 401`,
          r.status === 401,
          `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
      }
    }

    // Invalid JWT
    {
      const r = await req(method, path, { ...(hasBody ? { body: {} } : {}), token: 'malformed-jwt-token' });
      if (r.status === 0) {
        recordIssue(`${method} ${path}: network error on bad JWT`, `Error: ${r.error}`);
      } else {
        assert(`${method} ${path} — Invalid JWT → 401`,
          r.status === 401,
          `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
      }
    }
  }

  // Test POST /sync with fake Clerk token
  {
    info('Testing /api/users/sync without Clerk session...');
    const r = await req('POST', '/api/users/sync', {
      body: {},
      headers: { Authorization: 'Bearer fake-clerk-session-token' },
    });
    if (r.status === 0 || r.status >= 500) {
      recordIssue('/api/users/sync: crashed on invalid Clerk token',
        `Got HTTP ${r.status}. Error is not gracefully handled.`);
    } else {
      ok(`/api/users/sync — Invalid Clerk token → ${r.status} (handled gracefully) ✓`);
    }
  }
}

async function diagnoseEvents() {
  header('Events endpoints — Public routes');

  const r = await req('GET', '/api/events');
  if (r.status !== 200) {
    recordIssue('GET /api/events: should be 200',
      `Got HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  } else {
    ok(`GET /api/events → 200, ${r.data?.data?.length ?? '?'} events`);
  }

  const r2 = await req('GET', '/api/events/999999');
  if (r2.status !== 404) {
    recordIssue('GET /api/events/999999: should be 404',
      `Got HTTP ${r2.status}`);
  } else {
    ok('GET /api/events/999999 → 404 ✓');
  }
}

// ─── Summary ─────────────────────────────────────────────────
function printReport() {
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  AUTH DIAGNOSTICS REPORT${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);

  if (issues.length === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ No auth issues detected!${C.reset}\n`);
  } else {
    console.log(`\n  ${C.red}${C.bold}Found ${issues.length} issue(s):${C.reset}\n`);
    issues.forEach((issue, i) => {
      console.log(`  ${C.red}${i + 1}. ${issue.title}${C.reset}`);
      console.log(`     ${C.gray}${issue.detail}${C.reset}\n`);
    });
  }

  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.gray}  Common fixes for auth errors:`);
  console.log(`  • Ensure CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set in Render env`);
  console.log(`  • Ensure JWT_SECRET is set in Render env (for custom JWT auth)`);
  console.log(`  • The password column was removed — email/password auth is deprecated`);
  console.log(`  • Google auth now goes through Clerk — clients must call POST /api/users/sync`);
  console.log(`${C.reset}`);
}

async function main() {
  console.log(`\n${C.bold}  Nimbus 2k26 — Auth Diagnostics${C.reset}`);
  console.log(`${C.gray}  Target: ${BASE_URL}${C.reset}`);
  console.log(`${C.gray}  Time  : ${new Date().toISOString()}${C.reset}\n`);

  const alive = await checkServerReachability();
  if (!alive) {
    printReport();
    process.exit(1);
  }

  await diagnoseSendOtp();
  await diagnoseLogin();
  await diagnoseRegister();
  await diagnoseGoogleAuth();
  await diagnoseClerkMiddleware();
  await diagnoseProtectedRoutes();
  await diagnoseEvents();

  printReport();
  process.exit(issues.length > 0 ? 1 : 0);
}

main();
