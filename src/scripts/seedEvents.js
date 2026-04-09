/**
 * seedEvents.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds Nimbus 2k26 festival events into the database from the official schedule.
 *
 * Usage:
 *   node src/scripts/seedEvents.js
 *
 * Safe to re-run — it deletes all events belonging to the "Nimbus 2k26"
 * club before re-inserting, ensuring no duplicates and that old data is removed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env") });

import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── EVENTS DATA ──────────────────────────────────────────────────────────────
// Times converted from IST to UTC (subtracting 5 hours and 30 minutes).
const EVENTS = [
  // ── DAY 1 — Friday, April 10, 2026 ──────────────────────────────────────
  {
    event_name: "Lamp Lighting",
    venue: "Auditorium",
    event_time: "2026-04-10T05:30:00.000Z", // 11:00 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "Director's Address",
    venue: "Auditorium",
    event_time: "2026-04-10T05:50:00.000Z", // 11:20 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "Registrar Address",
    venue: "Auditorium",
    event_time: "2026-04-10T05:55:00.000Z", // 11:25 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "DSW Address",
    venue: "Auditorium",
    event_time: "2026-04-10T06:00:00.000Z", // 11:30 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "FI's Address",
    venue: "Auditorium",
    event_time: "2026-04-10T06:05:00.000Z", // 11:35 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "Vote of Thanks",
    venue: "Auditorium",
    event_time: "2026-04-10T06:10:00.000Z", // 11:40 AM IST
    image_url: "",
    extra_details: { description: "Inauguration", day: 1 },
  },
  {
    event_name: "Guest Lecture",
    venue: "Auditorium",
    event_time: "2026-04-10T06:30:00.000Z", // 12:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event", day: 1 },
  },
  {
    event_name: "Robowars",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (4-10 P.M.)", day: 1 },
  },
  {
    event_name: "RC RACE",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (4-10 P.M.)", day: 1 },
  },
  {
    event_name: "Drone Soccer",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (4-10 P.M.)", day: 1 },
  },
  {
    event_name: "Open Exhibition",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Core Event (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Departmental Exhibition",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Department (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Matcom Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Matcom (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "EXE Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: ".EXE (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Cryptic Hunt",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Ojas (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "C-Helix Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "C-Helix (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "DOC Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "DOC (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Vibhav Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Vibhav (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Metamorph Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Metamorph (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Hermetica Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Hermetica (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Abraxas Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Abraxas (4-8 P.M.)", day: 1 },
  },
  {
    event_name: "Medextrous Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Medextrous (4-8 P.M.)", day: 1 },
  },

  // ── DAY 2 — Saturday, April 11, 2026 ────────────────────────────────────
  {
    event_name: "Panel Discussion",
    venue: "Auditorium",
    event_time: "2026-04-11T08:30:00.000Z", // 2:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (2 P.M.)", day: 2 },
  },
  {
    event_name: "Departmental Exhibitions",
    venue: "Ground",
    event_time: "2026-04-11T09:30:00.000Z", // 3:00 PM IST (3-9 PM)
    image_url: "",
    extra_details: { description: "Departments (3-9 P.M.)", day: 2 },
  },
  {
    event_name: "Matcom Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Matcom (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Ojas Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Ojas (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "C-Helix Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "C-Helix (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "EXE Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "EXE (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Vibhav Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Vibhav (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Metamorph Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Metamorph (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Hermetica Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Hermetica (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "DOC Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "DOC (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Shooter Game",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Abraxas (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Medextrous Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z", // 4:00 PM IST (4-8 PM)
    image_url: "",
    extra_details: { description: "Medextrous (4-8 P.M.)", day: 2 },
  },
  {
    event_name: "Robowars",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z", // 5:00 PM IST (5-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (5-10 P.M.)", day: 2 },
  },
  {
    event_name: "RC Race",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z", // 5:00 PM IST (5-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (5-10 P.M.)", day: 2 },
  },
  {
    event_name: "Drone Soccer",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z", // 5:00 PM IST (5-10 PM)
    image_url: "",
    extra_details: { description: "Core Event (5-10 P.M.)", day: 2 },
  },

  // ── DAY 3 — Sunday, April 12, 2026 ──────────────────────────────────────
  {
    event_name: "Guest Lecture",
    venue: "Mini Auditorium",
    event_time: "2026-04-12T05:30:00.000Z", // 11:00 AM IST
    image_url: "",
    extra_details: { description: "Core Event", day: 3 },
  },
  {
    event_name: "Robowars",
    venue: "Ground",
    event_time: "2026-04-12T10:30:00.000Z", // 4:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (4 P.M.)", day: 3 },
  },
  {
    event_name: "RC Car Race",
    venue: "Ground",
    event_time: "2026-04-12T10:30:00.000Z", // 4:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (4 P.M.)", day: 3 },
  },
  {
    event_name: "Drone Soccer",
    venue: "Ground",
    event_time: "2026-04-12T10:30:00.000Z", // 4:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (4 P.M.)", day: 3 },
  },
  {
    event_name: "Felicitation",
    venue: "Auditorium",
    event_time: "2026-04-12T11:30:00.000Z", // 5:00 PM IST (5-8 PM)
    image_url: "",
    extra_details: { description: "Core Event (5-8 P.M.)", day: 3 },
  },
  {
    event_name: "Music Club Performance",
    venue: "Auditorium",
    event_time: "2026-04-12T12:30:00.000Z", // 6:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (6 P.M.)", day: 3 },
  },
  {
    event_name: "Closing Ceremony",
    venue: "Auditorium",
    event_time: "2026-04-12T13:30:00.000Z", // 7:00 PM IST
    image_url: "",
    extra_details: { description: "Core Event (7 P.M.)", day: 3 },
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting Nimbus 2k26 event seed based on latest schedule...\n");

  // 1. Wipe ALL existing events to ensure completely clean slate as requested
  const deletedAll = await prisma.event.deleteMany({});
  console.log(`🗑️  Removed ${deletedAll.count} existing events globally for clean re-seed.\n`);

  // 2. Ensure "Nimbus 2k26" core club exists
  const club = await prisma.club.upsert({
    where: { club_name: "Nimbus 2k26" },
    update: {},
    create: {
      club_name: "Nimbus 2k26",
      club_type: "CORE",
    },
  });
  console.log(`✅ Organization club ready: "${club.club_name}" (id=${club.club_id})\n`);

  // 3. Bulk-insert new schedule
  const data = EVENTS.map((e) => ({
    ...e,
    event_time: new Date(e.event_time),
    image_url: e.image_url || null,
    organizing_club_id: club.club_id,
  }));

  const result = await prisma.event.createMany({ data });
  console.log(`🎉 Inserted ${result.count} new events successfully!\n`);

  // 4. Quick summary
  const byDay = EVENTS.reduce((acc, e) => {
    const d = e.extra_details.day;
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  Object.entries(byDay).sort(([a], [b]) => a - b).forEach(([day, count]) => {
    const labels = { 1: "Friday Apr 10", 2: "Saturday Apr 11", 3: "Sunday Apr 12" };
    console.log(`   Day ${day} (${labels[day]}): ${count} events`);
  });
  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
