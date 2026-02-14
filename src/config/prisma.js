import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Handle pool errors to prevent uncaught exceptions
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  console.error('Error stack:', err.stack);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export default prisma;
