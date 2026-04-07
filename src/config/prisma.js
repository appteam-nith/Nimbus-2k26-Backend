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
  } catch (e) {
    console.error('❌ DB connection failed:', e.message);
  }
}
testConnection();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
});

export default prisma;