import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import UserRoutes from "./routes/userRoute.js";
import CoreTeamRoutes from "./routes/coreTeamRoute.js";
import EventRoutes from "./routes/eventRoute.js";
import errorHandler from "./middlewares/errorMiddleware.js";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow all origins so Flutter mobile + web can connect
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Clerk — populates auth context on every request.
// Wrapped in a safety net so a malformed Authorization header never
// throws an unhandled error and crashes the pipeline with a 500.
app.get('/', (req, res) => {
  res.json({message: 'Hello, Nimbus 2k26 Backend!'});
});

app.use((req, res, next) => {
  try {
    clerkMiddleware()(req, res, (err) => {
      if (err) {
        // Clerk threw (e.g. malformed token) — log and continue.
        // The protect middleware will still reject unauthenticated requests.
        console.warn('[clerkMiddleware] error (ignored):', err?.message ?? err);
      }
      next();
    });
  } catch (err) {
    console.warn('[clerkMiddleware] sync error (ignored):', err?.message ?? err);
    next();
  }
});

app.use('/api/users', UserRoutes);
app.use('/api/coreteam', CoreTeamRoutes);
app.use('/api/events', EventRoutes);

// Global error handler — must be last
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});