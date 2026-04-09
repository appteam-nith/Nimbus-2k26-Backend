#!/usr/bin/env node
require("dotenv").config();
const { Client } = require("pg");

(async () => {
  console.log("=== Nimbus City — Bot Cleanup Script ===\n");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("✅ Connected to database\n");

    // ── 1. Preview bots that will be deleted ─────────────────────────────────
    const previewRes = await client.query(`
      SELECT user_id, full_name, email, created_at
      FROM "User"
      WHERE full_name ILIKE 'Bot %'
        AND email LIKE '%@bot.local'
      ORDER BY created_at DESC
    `);

    if (previewRes.rowCount === 0) {
      console.log(
        "✅ No bot users found in the database. Nothing to clean up.",
      );
      await client.end();
      process.exit(0);
    }

    console.log(`Found ${previewRes.rowCount} bot user(s) to delete:\n`);
    previewRes.rows.forEach((r, i) => {
      console.log(
        `  ${i + 1}. ${r.full_name.padEnd(20)} | ${r.email.padEnd(40)} | created: ${new Date(r.created_at).toISOString()}`,
      );
    });

    // ── 2. Preview orphaned dev-mode game rooms ───────────────────────────────
    const devRoomsRes = await client.query(`
      SELECT r.room_code, r.status, r.created_at,
             COUNT(p.id)                                          AS total_players,
             COUNT(p.id) FILTER (WHERE p."isBot" = TRUE)         AS bot_players,
             COUNT(p.id) FILTER (WHERE p."isBot" = FALSE)        AS real_players
      FROM "GameRoom" r
      LEFT JOIN "GamePlayer" p ON p.room_code = r.room_code
      WHERE (r.state_meta::jsonb ->> 'dev_mode') = 'true'
        AND r.status NOT IN ('LOBBY', 'ENDED')
      GROUP BY r.room_code, r.status, r.created_at
      ORDER BY r.created_at DESC
    `);

    const stuckRooms = devRoomsRes.rows;

    // Only rooms with no real players left are safe to auto-delete
    const roomsToDelete = stuckRooms.filter(
      (r) => Number(r.real_players) === 0,
    );
    const roomsWithRealPlayers = stuckRooms.filter(
      (r) => Number(r.real_players) > 0,
    );

    if (stuckRooms.length > 0) {
      console.log(`\nFound ${stuckRooms.length} stuck dev-mode room(s):\n`);
      stuckRooms.forEach((r) => {
        const safeToDelete = Number(r.real_players) === 0;
        console.log(
          `  ${safeToDelete ? "🗑 " : "⚠️ "} ${r.room_code} | status: ${r.status.padEnd(12)} | ` +
            `real: ${r.real_players}, bots: ${r.bot_players} | created: ${new Date(r.created_at).toISOString()}`,
        );
      });

      if (roomsWithRealPlayers.length > 0) {
        console.log(
          `\n⚠️  Skipping ${roomsWithRealPlayers.length} room(s) that still have real players.`,
        );
      }
    }

    // ── 3. Execute cleanup inside a transaction ───────────────────────────────
    console.log("\n--- Executing cleanup ---\n");
    await client.query("BEGIN");

    // 3a. Delete stuck dev-mode rooms with no real players
    //     (CASCADE removes GamePlayer + GameVote rows automatically)
    let deletedRooms = 0;
    if (roomsToDelete.length > 0) {
      const roomCodes = roomsToDelete.map((r) => r.room_code);
      const delRoomRes = await client.query(
        `DELETE FROM "GameRoom" WHERE room_code = ANY($1)`,
        [roomCodes],
      );
      deletedRooms = delRoomRes.rowCount;
      console.log(
        `🗑  Deleted ${deletedRooms} stuck dev-mode room(s) (cascade removed their players + votes)`,
      );
    }

    // 3b. Delete bot User records
    //     (CASCADE removes any remaining GamePlayer rows for those users)
    const delBotsRes = await client.query(`
      DELETE FROM "User"
      WHERE full_name ILIKE 'Bot %'
        AND email LIKE '%@bot.local'
    `);
    const deletedBots = delBotsRes.rowCount;
    console.log(
      `🤖 Deleted ${deletedBots} bot User record(s) (cascade removed linked GamePlayer rows)`,
    );

    await client.query("COMMIT");
    console.log("\n✅ Transaction committed successfully.\n");

    // ── 4. Post-cleanup summary ───────────────────────────────────────────────
    const remainingBotsRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM "User"
      WHERE full_name ILIKE 'Bot %' AND email LIKE '%@bot.local'
    `);
    const remainingRoomsRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM "GameRoom"
      WHERE (state_meta::jsonb ->> 'dev_mode') = 'true'
        AND status NOT IN ('LOBBY', 'ENDED')
    `);

    console.log("=== Summary ===");
    console.log(`  Bot users deleted  : ${deletedBots}`);
    console.log(`  Dev rooms deleted  : ${deletedRooms}`);
    console.log(`  Bot users remaining: ${remainingBotsRes.rows[0].cnt}`);
    console.log(`  Stuck rooms remaining: ${remainingRoomsRes.rows[0].cnt}`);
    console.log("================\n");

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error during cleanup:", err.message);
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  }
})();
