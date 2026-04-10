import "dotenv/config.js";

import express from "express";
import cors from "cors";
import UserRoutes from "./routes/userRoute.js";
import CoreTeamRoutes from "./routes/coreTeamRoute.js";
import GameRoutes from "./routes/gameRoutes.js";
import errorHandler from "./middlewares/errorMiddleware.js";
import { resolveExpiredRooms } from "./services/game/resolveService.js";
import pusher from "./config/pusher.js";
import clubRoutes from "./routes/clubsRoute.js";
import eventRoute from "./routes/eventRoute.js";
import projectRoute from "./routes/projectRoute.js";
import CommunityChatRoutes from "./routes/communityChatRoute.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Hello, Nimbus 2k26 Backend!" });
});

// ── Account Deletion Page (required by Google Play Store) ─────────────────────
app.get("/delete-account", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Delete Account – Nimbus 2k26</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f6fa;
      color: #111827;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      max-width: 520px;
      width: 100%;
      padding: 40px 36px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .logo-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }
    .logo-box {
      width: 52px; height: 52px;
      background: linear-gradient(135deg, #1A3BB3, #2D5BE3);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    .app-name { font-size: 20px; font-weight: 700; color: #1A3BB3; }
    h1 { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 10px; }
    .subtitle { font-size: 14px; color: #6B7280; line-height: 1.6; margin-bottom: 28px; }
    .warning-box {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 28px;
      font-size: 13px;
      color: #7F1D1D;
      line-height: 1.6;
    }
    .warning-box strong { display: block; margin-bottom: 4px; color: #DC2626; }
    h2 { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 14px; }
    .steps { list-style: none; display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
    .steps li {
      display: flex; align-items: flex-start; gap: 12px;
      font-size: 14px; color: #374151; line-height: 1.5;
    }
    .step-num {
      min-width: 26px; height: 26px;
      background: #2D5BE3; color: #fff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
    }
    .divider { border: none; border-top: 1px solid #E5E7EB; margin: 24px 0; }
    .contact { font-size: 13px; color: #6B7280; line-height: 1.6; }
    .contact a { color: #2D5BE3; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <div class="logo-box">🌀</div>
      <span class="app-name">Nimbus 2k26</span>
    </div>

    <h1>Delete Your Account</h1>
    <p class="subtitle">
      You can permanently delete your Nimbus 2k26 account and all associated data
      directly from within the app. This includes your profile, points, event registrations,
      and any other personal information.
    </p>

    <div class="warning-box">
      <strong>⚠️ This action is permanent</strong>
      Once your account is deleted, it cannot be recovered. All your data will be
      removed immediately and cannot be restored.
    </div>

    <h2>How to delete your account</h2>
    <ol class="steps">
      <li>
        <span class="step-num">1</span>
        <span>Open the <strong>Nimbus 2k26</strong> app on your device</span>
      </li>
      <li>
        <span class="step-num">2</span>
        <span>Tap the <strong>Profile</strong> icon in the bottom navigation bar</span>
      </li>
      <li>
        <span class="step-num">3</span>
        <span>Scroll down to the bottom of the page</span>
      </li>
      <li>
        <span class="step-num">4</span>
        <span>Tap <strong>"Delete Account"</strong> and confirm when prompted</span>
      </li>
    </ol>

    <hr class="divider" />

    <p class="contact">
      Need help or want to request deletion by email?<br />
      Contact us at <a href="mailto:appteam@nith.ac.in">appteam@nith.ac.in</a>
      and we will process your request within 7 days.
    </p>
  </div>
</body>
</html>`);
});

// ── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/clubs", clubRoutes);
app.use("/api/events", eventRoute);
app.use("/api/projects", projectRoute);
app.use("/api/users", UserRoutes);
app.use("/api/coreteam", CoreTeamRoutes);
app.use("/api/game", GameRoutes);
app.use("/api/community-chat", CommunityChatRoutes);

app.get("/api/config/update", (req, res) => {
  res.json({
    requiredVersionCode: process.env.REQUIRED_VERSION_CODE ? parseInt(process.env.REQUIRED_VERSION_CODE) : 7,
    playStoreUrl: process.env.PLAYSTORE_URL || "https://play.google.com/store/apps/details?id=com.nith.nimbus2k26"
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // ─── GAME HEARTBEAT ─────────────────────────────────────────────────────────
  // Checks every second for rooms whose phase timer has expired and resolves them.
  // This is the clock that drives the entire game loop.
  
  // FIX: Guard prevents multiple intervals on hot reload/restart
  if (!global.gameHeartbeat) {
    global.gameHeartbeat = setInterval(async () => {
      try {
        await resolveExpiredRooms();
      } catch (e) {
        console.error("[heartbeat] Error resolving expired rooms:", e);
      }
    }, 1000);
    console.log("[heartbeat] Game loop started (1s interval)");
  }
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
process.on("SIGINT", () => {
  console.log("[shutdown] Cleaning up...");
  if (global.gameHeartbeat) {
    clearInterval(global.gameHeartbeat);
    console.log("[shutdown] Game heartbeat cleared");
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[shutdown] Cleaning up...");
  if (global.gameHeartbeat) {
    clearInterval(global.gameHeartbeat);
    console.log("[shutdown] Game heartbeat cleared");
  }
  process.exit(0);
});