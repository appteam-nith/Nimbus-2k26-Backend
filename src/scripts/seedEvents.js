/**
 * seedEvents.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds Nimbus 2k26 festival events into the database.
 *
 * Usage:
 *   node src/scripts/seedEvents.js
 *
 * Safe to re-run — it deletes all events belonging to the "Nimbus 2k26"
 * club before re-inserting, so you won't get duplicates.
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
// All event_time values are already in UTC (IST − 5:30).
const EVENTS = [
  // ── DAY 1 — Friday, April 10, 2026 ──────────────────────────────────────
  {
    event_name: "Lamp Lighting",
    venue: "Auditorium",
    event_time: "2026-04-10T05:30:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Lamp Lighting ceremony", day: 1 },
  },
  {
    event_name: "Director's Address",
    venue: "Auditorium",
    event_time: "2026-04-10T05:50:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Director's Address", day: 1 },
  },
  {
    event_name: "Registrar Address",
    venue: "Auditorium",
    event_time: "2026-04-10T05:55:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Registrar's Address", day: 1 },
  },
  {
    event_name: "DSW Address",
    venue: "Auditorium",
    event_time: "2026-04-10T06:00:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Dean of Student Welfare Address", day: 1 },
  },
  {
    event_name: "FI's Address",
    venue: "Auditorium",
    event_time: "2026-04-10T06:05:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Faculty Incharge Address", day: 1 },
  },
  {
    event_name: "Vote of Thanks",
    venue: "Auditorium",
    event_time: "2026-04-10T06:10:00.000Z",
    image_url: "",
    extra_details: { description: "Inauguration — Vote of Thanks", day: 1 },
  },
  {
    event_name: "Guest Lecture",
    venue: "Auditorium",
    event_time: "2026-04-10T06:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Guest Lecture", day: 1 },
  },
  {
    event_name: "Robowars",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Robot combat competition", day: 1 },
  },
  {
    event_name: "RC Race",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — RC car racing competition", day: 1 },
  },
  {
    event_name: "Drone Soccer",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Drone soccer competition", day: 1 },
  },
  {
    event_name: "Open Exhibition",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Open project exhibition", day: 1 },
  },
  {
    event_name: "Departmental Exhibition",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Department — Departmental project exhibition", day: 1 },
  },
  {
    event_name: "Matcom Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Matcom club events", day: 1 },
  },
  {
    event_name: "EXE Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "EXE club events", day: 1 },
  },
  {
    event_name: "Cryptic Hunt",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Ojas — Cryptic Hunt challenge", day: 1 },
  },
  {
    event_name: "C-Helix Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "C-Helix club events", day: 1 },
  },
  {
    event_name: "DOC Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "DOC club events", day: 1 },
  },
  {
    event_name: "Vibhav Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Vibhav club events", day: 1 },
  },
  {
    event_name: "Metamorph Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Metamorph club events", day: 1 },
  },
  {
    event_name: "Hermetica Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Hermetica club events", day: 1 },
  },
  {
    event_name: "Abraxas Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Abraxas club events", day: 1 },
  },
  {
    event_name: "Medextrous Events",
    venue: "Ground",
    event_time: "2026-04-10T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Medextrous club events", day: 1 },
  },

  // ── DAY 2 — Saturday, April 11, 2026 ────────────────────────────────────
  {
    event_name: "Panel Discussion",
    venue: "Auditorium",
    event_time: "2026-04-11T08:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Panel Discussion", day: 2 },
  },
  {
    event_name: "Departmental Exhibitions",
    venue: "Ground",
    event_time: "2026-04-11T09:30:00.000Z",
    image_url: "",
    extra_details: { description: "Departmental project exhibitions", day: 2 },
  },
  {
    event_name: "Matcom Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Matcom club events", day: 2 },
  },
  {
    event_name: "Ojas Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Ojas club events", day: 2 },
  },
  {
    event_name: "C-Helix Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "C-Helix club events", day: 2 },
  },
  {
    event_name: "EXE Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "EXE club events", day: 2 },
  },
  {
    event_name: "Vibhav Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Vibhav club events", day: 2 },
  },
  {
    event_name: "Metamorph Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Metamorph club events", day: 2 },
  },
  {
    event_name: "Hermetica Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Hermetica club events", day: 2 },
  },
  {
    event_name: "DOC Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "DOC club events", day: 2 },
  },
  {
    event_name: "Shooter Game",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Abraxas — Shooter Game", day: 2 },
  },
  {
    event_name: "Medextrous Events",
    venue: "Ground",
    event_time: "2026-04-11T10:30:00.000Z",
    image_url: "",
    extra_details: { description: "Medextrous club events", day: 2 },
  },
  {
    event_name: "Robowars",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Robot combat competition", day: 2 },
  },
  {
    event_name: "RC Race",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — RC car racing competition", day: 2 },
  },
  {
    event_name: "Drone Soccer",
    venue: "Ground",
    event_time: "2026-04-11T11:30:00.000Z",
    image_url: "",
    extra_details: { description: "Core Event — Drone soccer competition", day: 2 },
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting Nimbus 2k26 event seed...\n");

  // 1. Upsert the catch-all "Nimbus 2k26" club
  const club = await prisma.club.upsert({
    where: { club_name: "Nimbus 2k26" },
    update: {},
    create: {
      club_name: "Nimbus 2k26",
      club_type: "CORE",
    },
  });
  console.log(`✅ Club ready: "${club.club_name}" (id=${club.club_id})\n`);

  // 2. Delete any existing events for this club (idempotent re-runs)
  const deleted = await prisma.event.deleteMany({
    where: { organizing_club_id: club.club_id },
  });
  if (deleted.count > 0) {
    console.log(`🗑️  Removed ${deleted.count} existing event(s) for clean re-seed.\n`);
  }

  // 3. Bulk-insert all events
  const data = EVENTS.map((e) => ({
    event_name: e.event_name,
    venue: e.venue,
    event_time: new Date(e.event_time),
    image_url: e.image_url || null,
    extra_details: e.extra_details,
    organizing_club_id: club.club_id,
  }));

  const result = await prisma.event.createMany({ data });
  console.log(`🎉 Inserted ${result.count} events successfully!\n`);

  // 4. Quick summary by day
  const byDay = EVENTS.reduce((acc, e) => {
    const d = e.extra_details.day;
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  Object.entries(byDay).forEach(([day, count]) => {
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
