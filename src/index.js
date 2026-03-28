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

// Clerk — populates auth context on every request
app.use(clerkMiddleware());

app.get('/', (req, res) => {
  res.send('Hello, Nimbus 2k26 Backend!');
});

app.use('/api/users', UserRoutes);
app.use('/api/coreteam', CoreTeamRoutes);
app.use('/api/events', EventRoutes);

// Global error handler — must be last
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});