import { spawn } from 'child_process';

async function main() {
  // Attempt to use global fetch (Node 18+), otherwise dynamically import node-fetch
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    const mod = await import('node-fetch');
    fetchFn = mod.default;
  }

  const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || 'reviewer@nith.ac.in';
  const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD || 'NimbusReviewer@2026#Secure!';
  const PORT = process.env.TEST_PORT || 6007;

  console.log('Starting temporary backend server for mafia tests on port', PORT);

  const server = spawn('node', ['--env-file=.env', 'src/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) },
  });

  let started = false;
  server.stdout.on('data', (d) => {
    const s = d.toString();
    process.stdout.write(s);
    if (!started && s.includes('Server running on')) {
      started = true;
      runTests().catch(async (err) => {
        console.error('ERROR during tests:', err);
        server.kill();
        process.exit(1);
      });
    }
  });

  server.stderr.on('data', (d) => {
    const s = d.toString();
    process.stderr.write(s);
  });

  // Timeout guard
  setTimeout(() => {
    if (!started) {
      console.error('Server did not start in time. Aborting.');
      server.kill();
      process.exit(1);
    }
  }, 15000);

  async function authFetch(path, method = 'GET', token = null, body = null) {
    const headers = {};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetchFn(`http://localhost:${PORT}/api${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  }

  async function runTests() {
    console.log('\n=== Logging in as reviewer ===');
    const loginResp = await fetchFn(`http://localhost:${PORT}/api/users/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD }),
    });
    const loginJson = await loginResp.json();
    if (loginResp.status !== 200 || !loginJson.token) {
      console.error('Reviewer login failed:', loginJson);
      server.kill();
      process.exit(1);
    }
    const hostToken = loginJson.token;
    const hostUserId = loginJson.user?.id || loginJson.user?.userId || null;
    console.log('Reviewer token acquired. User id:', hostUserId);

    const roleTests = [
      { role: 'COP', room_size: 'FIVE' },
      { role: 'REPORTER', room_size: 'EIGHT' },
      { role: 'BOUNTY_HUNTER', room_size: 'EIGHT' },
      { role: 'HITMAN', room_size: 'EIGHT' },
      { role: 'DOCTOR', room_size: 'FIVE' },
      { role: 'NURSE', room_size: 'TWELVE' },
      { role: 'MAFIA', room_size: 'FIVE' },
    ];

    const results = [];

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    async function startGameWithRetry(roomCode, token, role, attempts = 3) {
      for (let i = 0; i < attempts; i++) {
        const resp = await authFetch('/game/start', 'POST', token, {
          room_code: roomCode,
          dev_mode: true,
          dev_host_role: role,
        });
        if (resp.status === 200) return resp;
        // Retry on server/transaction errors
        console.warn(`start-game attempt ${i + 1} failed:`, resp.json?.error || resp.status);
        await sleep(500 + i * 250);
      }
      return { status: 500, json: { error: 'start-game-retries-exhausted' } };
    }

    async function waitForPhase(roomCode, token, desiredPhase = 'DISCUSSION', timeoutMs = 35000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const st = await authFetch(`/game/rooms/${roomCode}`, 'GET', token);
        if (st.status === 200 && st.json) {
          if (st.json.status === desiredPhase) return st.json;
        }
        await sleep(1000);
      }
      return null;
    }

    for (const { role, room_size } of roleTests) {
      console.log(`\n--- Testing role: ${role} (room_size=${room_size}) ---`);

      // Create a fresh room
      const create = await authFetch('/game/rooms', 'POST', hostToken, { room_size });
      if (create.status !== 201 || !create.json?.roomCode) {
        console.error('Failed to create room:', create.json);
        results.push({ role, ok: false, reason: 'create-room-failed' });
        continue;
      }
      const roomCode = create.json.roomCode;
      console.log('Room created:', roomCode);

      // Start game in dev mode forcing host role, with retries
      const start = await startGameWithRetry(roomCode, hostToken, role, 4);
      if (start.status !== 200) {
        console.error('Failed to start game after retries:', start.json);
        results.push({ role, ok: false, reason: 'start-game-failed' });
        continue;
      }

      // Small delay to allow DB updates
      await sleep(600);

      // Fetch room state as host (should include roles in devMode)
      const state = await authFetch(`/game/rooms/${roomCode}`, 'GET', hostToken);
      if (state.status !== 200 || !state.json) {
        console.error('Failed to fetch room state:', state.json);
        results.push({ role, ok: false, reason: 'get-room-failed' });
        continue;
      }
      const room = state.json;
      console.log('Room status:', room.status, 'round:', room.round, 'devMode:', room.devMode);

      // Verify host role
      const hostPlayer = room.players.find((p) => p.userId === hostUserId);
      const assignedRole = hostPlayer?.role || room.myRole || null;
      console.log('Assigned host role (from state):', assignedRole);

      // Pick a target (first non-host player)
      const target = room.players.find((p) => p.userId !== hostUserId);
      if (!target) {
        console.warn('No non-host player found to target (unexpected)');
        results.push({ role, ok: false, reason: 'no-target' });
        continue;
      }
      const targetUserId = target.userId;

      try {
        let voteResp;
        switch (role) {
          case 'COP':
            console.log('COP investigate target:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'COP_INVESTIGATE' });
            console.log('COP response:', voteResp.json);
            results.push({ role, ok: voteResp.status === 200, detail: voteResp.json });
            break;

          case 'REPORTER':
            console.log('REPORTER expose target:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'REPORTER_EXPOSE' });
            console.log('REPORTER response:', voteResp.json);
            results.push({ role, ok: voteResp.status === 200, detail: voteResp.json });
            break;

          case 'BOUNTY_HUNTER':
            console.log('BOUNTY_HUNTER VIP select:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'BOUNTY_HUNTER_VIP' });
            console.log('BOUNTY VIP response:', voteResp.json);
            // Fetch room state again to verify VIP persisted
            const afterVip = await authFetch(`/game/rooms/${roomCode}`, 'GET', hostToken);
            console.log('bountyVipUserId:', afterVip.json?.bountyVipUserId);
            results.push({ role, ok: voteResp.status === 200 && afterVip.json?.bountyVipUserId === targetUserId, detail: voteResp.json });
            break;

          case 'HITMAN':
            // Need two distinct targets that are not COP and not host
            const candidates = room.players.filter((p) => p.userId !== hostUserId && p.role !== 'COP');
            if (candidates.length < 2) {
              console.warn('Not enough non-COP targets for HITMAN test');
              results.push({ role, ok: false, reason: 'not-enough-hitmap-targets' });
              break;
            }
            const t1 = candidates[0].userId;
            const t2 = candidates[1].userId;
            const targetMeta = { targets: [t1, t2], roles: ['CITIZEN', 'CITIZEN'] };
            console.log('HITMAN targets:', targetMeta);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, vote_type: 'HITMAN_TARGET', target_meta: targetMeta });
            console.log('HITMAN response:', voteResp.json);
            if (voteResp.status === 200) {
              // Wait for night resolution (hitman early + night end)
              console.log('Waiting for night resolution (DISCUSSION)...');
              const resolved = await waitForPhase(roomCode, hostToken, 'DISCUSSION', 35000);
              const after = resolved || (await authFetch(`/game/rooms/${roomCode}`, 'GET', hostToken)).json;
              const eliminated = (after.players || []).filter((p) => p.status !== 'ALIVE');
              console.log('Eliminated players after night:', eliminated.length);
              results.push({ role, ok: true, detail: { vote: voteResp.json, eliminatedCount: eliminated.length } });
            } else {
              results.push({ role, ok: false, detail: voteResp.json });
            }
            break;

          case 'DOCTOR':
            console.log('DOCTOR save target:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'DOC_SAVE' });
            console.log('DOCTOR response:', voteResp.json);
            results.push({ role, ok: voteResp.status === 200, detail: voteResp.json });
            break;

          case 'NURSE':
            console.log('NURSE action target:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'NURSE_ACTION' });
            console.log('NURSE response:', voteResp.json);
            results.push({ role, ok: voteResp.status === 200, detail: voteResp.json });
            break;

          case 'MAFIA':
            console.log('MAFIA target:', targetUserId);
            voteResp = await authFetch('/game/vote', 'POST', hostToken, { room_code: roomCode, target_id: targetUserId, vote_type: 'MAFIA_TARGET' });
            console.log('MAFIA response:', voteResp.json);
            if (voteResp.status === 200) {
              console.log('Waiting for night resolution (DISCUSSION) to check kills...');
              const resolved = await waitForPhase(roomCode, hostToken, 'DISCUSSION', 35000);
              const after = resolved || (await authFetch(`/game/rooms/${roomCode}`, 'GET', hostToken)).json;
              const eliminated = (after.players || []).filter((p) => p.status !== 'ALIVE');
              console.log('Eliminated players after night:', eliminated.length);
              results.push({ role, ok: true, detail: { vote: voteResp.json, eliminatedCount: eliminated.length } });
            } else {
              results.push({ role, ok: false, detail: voteResp.json });
            }
            break;

          default:
            results.push({ role, ok: false, reason: 'no-test-defined' });
        }
      } catch (err) {
        console.error('Error testing role', role, err.message);
        results.push({ role, ok: false, reason: err.message });
      }
    }

    console.log('\n=== Test Summary ===');
    let allOk = true;
    for (const r of results) {
      console.log('-', r.role + ':', r.ok ? 'OK' : 'FAILED', r.reason ? `(${r.reason})` : '');
      if (!r.ok) allOk = false;
    }

    console.log('\nShutting down test server...');
    server.kill();
    process.exit(allOk ? 0 : 2);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
