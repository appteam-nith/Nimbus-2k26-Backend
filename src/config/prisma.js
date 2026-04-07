import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  min: 0,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    await ensureUserColumns();
  } catch (e) {
    console.error('❌ DB connection failed:', e.message);
  }
}

async function ensureUserColumns() {
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User'`,
    );
    const colNames = res.rows.map((row) => row.column_name);

    if (!colNames.includes('google_id')) {
      await pool.query(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "google_id" TEXT;',
      );
      console.log('✅ Ensured User.google_id column exists');
    }

    if (!colNames.includes('password_hash')) {
      await pool.query(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;',
      );
      console.log('✅ Ensured User.password_hash column exists');

      if (colNames.includes('password')) {
        await pool.query(
          'UPDATE "User" SET "password_hash" = "password" WHERE "password_hash" IS NULL AND "password" IS NOT NULL;',
        );
        console.log('✅ Copied legacy User.password values into User.password_hash');
      }
    }

    if (!colNames.includes('is_verified')) {
      await pool.query(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_verified" BOOLEAN DEFAULT FALSE;',
      );
      console.log('✅ Ensured User.is_verified column exists');
    }

    await pool.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "User_google_id_key" ON "User" ("google_id") WHERE "google_id" IS NOT NULL;',
    );
  } catch (e) {
    console.error('❌ Failed to ensure User table compatibility:', e.message);
  }
}

testConnection();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
});

export default prisma;