#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  console.log('Connecting to DB...');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Connected');

    console.log('Beginning transaction...');
    await client.query('BEGIN');

    const updateRes = await client.query('UPDATE "User" SET experience = 1000 WHERE experience IS NULL OR experience = 0');
    console.log(`Updated rows: ${updateRes.rowCount}`);

    await client.query('ALTER TABLE "User" ALTER COLUMN experience SET DEFAULT 1000');
    console.log('Set default for "experience" to 1000');

    await client.query('ALTER TABLE "User" ALTER COLUMN "experience_updated_at" SET DEFAULT now()');
    console.log('Set default for "experience_updated_at" to now()');

    await client.query('COMMIT');

    const totalsRes = await client.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN experience IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN experience = 0 THEN 1 ELSE 0 END) as zero_count,
        SUM(CASE WHEN experience = 1000 THEN 1 ELSE 0 END) as one_thousand_count,
        SUM(CASE WHEN experience < 1000 THEN 1 ELSE 0 END) as lt_thousand_count,
        SUM(CASE WHEN experience > 1000 THEN 1 ELSE 0 END) as gt_thousand_count
      FROM "User";
    `);
    const totals = totalsRes.rows[0];
    console.log('Totals:');
    console.log(`  total users: ${totals.total}`);
    console.log(`  experience IS NULL: ${totals.null_count}`);
    console.log(`  experience = 0: ${totals.zero_count}`);
    console.log(`  experience = 1000: ${totals.one_thousand_count}`);
    console.log(`  experience < 1000: ${totals.lt_thousand_count}`);
    console.log(`  experience > 1000: ${totals.gt_thousand_count}`);

    const topRes = await client.query('SELECT id, full_name, experience FROM "User" ORDER BY experience DESC, "experience_updated_at" ASC, full_name ASC LIMIT 10');
    console.log('\nTop 10 users:');
    topRes.rows.forEach(r => {
      console.log(`  ${r.id} | ${r.full_name} | ${r.experience}`);
    });

    await client.end();
    process.exit(0);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error(err);
    try { await client.end(); } catch (e) {}
    process.exit(1);
  }
})();
