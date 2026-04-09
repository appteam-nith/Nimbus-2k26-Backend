import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    console.log('Connecting to DB...');
    // simple test query
    const totalRes = await pool.query('SELECT COUNT(*) as cnt FROM "User"');
    const total = Number(totalRes.rows[0].cnt);

    const nullRes = await pool.query('SELECT COUNT(*) as cnt FROM "User" WHERE experience IS NULL');
    const zeroRes = await pool.query('SELECT COUNT(*) as cnt FROM "User" WHERE experience = 0');
    const eq1000Res = await pool.query('SELECT COUNT(*) as cnt FROM "User" WHERE experience = 1000');
    const lt1000Res = await pool.query('SELECT COUNT(*) as cnt FROM "User" WHERE experience < 1000');
    const gt1000Res = await pool.query('SELECT COUNT(*) as cnt FROM "User" WHERE experience > 1000');

    console.log('Totals:');
    console.log('  total users:', total);
    console.log('  experience IS NULL:', Number(nullRes.rows[0].cnt));
    console.log('  experience = 0:', Number(zeroRes.rows[0].cnt));
    console.log('  experience = 1000:', Number(eq1000Res.rows[0].cnt));
    console.log('  experience < 1000:', Number(lt1000Res.rows[0].cnt));
    console.log('  experience > 1000:', Number(gt1000Res.rows[0].cnt));

    const sample = await pool.query('SELECT user_id, full_name, experience FROM "User" ORDER BY experience DESC NULLS LAST, experience_updated_at ASC, full_name ASC LIMIT 10');
    console.log('\nTop 10 users:');
    for (const r of sample.rows) {
      console.log(`  ${r.user_id} | ${r.full_name} | ${r.experience}`);
    }
  } catch (e) {
    console.error('ERROR', e.message || e);
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main();
