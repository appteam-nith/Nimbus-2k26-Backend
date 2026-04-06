import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

const { PrismaClient } = pkg;

dotenv.config();

async function testConnection() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not defined in .env file");
    }

    console.log("Testing Neon PostgreSQL connection...");
    const dbHost = process.env.DATABASE_URL.split('@')[1]?.split('?')[0];
    console.log(`Database endpoint: ${dbHost || 'unknown'}`);

    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Test connection
    const result = await pool.query('SELECT NOW()');
    console.log("✓ Database connection successful!");
    console.log("Current time from database:", result.rows[0].now);

    // Show database info
    const dbInfo = await pool.query('SELECT datname FROM pg_database WHERE datname = current_database()');
    console.log("Database info:", dbInfo.rows[0]);

    // Initialize Prisma Client
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    // Test Prisma
    console.log("\nTesting Prisma Client...");
    const users = await prisma.user.count();
    console.log(`✓ Prisma Client working! User count: ${users}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("✗ Connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
