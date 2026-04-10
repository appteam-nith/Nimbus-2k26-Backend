import dotenv from "dotenv";
dotenv.config();

const r = {
  project_id:    process.env.FIREBASE_PROJECT_ID    ? "SET" : "MISSING",
  client_email:  process.env.FIREBASE_CLIENT_EMAIL   ? "SET" : "MISSING",
  private_key:   process.env.FIREBASE_PRIVATE_KEY    ? "SET len=" + process.env.FIREBASE_PRIVATE_KEY.length : "MISSING",
  jwt_secret:    process.env.JWT_SECRET              ? "SET" : "MISSING",
  database_url:  process.env.DATABASE_URL            ? "SET" : "MISSING",
};

for (const [k, v] of Object.entries(r)) {
  process.stdout.write(k + ": " + v + "\n");
}

// Test Firebase Admin init
try {
  const { default: admin } = await import("firebase-admin");
  if (!admin.apps.length) {
    const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: key,
      }),
    });
  }
  process.stdout.write("firebase_admin_init: OK\n");
} catch(e) {
  process.stdout.write("firebase_admin_init: FAILED - " + e.message + "\n");
}

// Test DB + upsert
import { writeFileSync } from "fs";
try {
  const { default: prisma } = await import("./src/config/prisma.js");
  await prisma.user.count();
  process.stdout.write("db_connection: OK\n");

  const { upsertGoogleUser } = await import("./src/services/user/userService.js");
  const u = await upsertGoogleUser("diag-001", "Test User", "diag@nith.ac.in");
  process.stdout.write("upsert_google_user: OK user_id=" + u.user_id + "\n");
  await prisma.user.delete({ where: { user_id: u.user_id } }).catch(() => {});
  await prisma.$disconnect();
} catch(e) {
  const msg = "UPSERT ERROR:\n" + e.message + "\n\nSTACK:\n" + e.stack;
  writeFileSync("auth-error.txt", msg);
  process.stdout.write("db_or_upsert: FAILED - see auth-error.txt\n");
}

// Test JWT
try {
  const { default: generateToken } = await import("./src/services/generateTokenService.js");
  const tok = generateToken("test-id");
  process.stdout.write("jwt_generate: OK len=" + tok.length + "\n");
} catch(e) {
  process.stdout.write("jwt_generate: FAILED - " + e.message + "\n");
}

process.stdout.write("DONE\n");
