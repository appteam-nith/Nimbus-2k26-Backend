import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import UserRoutes from "./routes/userRoute.js";
import CoreTeamRoutes from "./routes/coreTeamRoute.js";
import EventRoutes from "./routes/eventRoute.js";
import errorHandler from "./middlewares/errorMiddleware.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Hello, Nimbus 2k26 Backend!" });
});

app.use("/api/users", UserRoutes);
app.use("/api/coreteam", CoreTeamRoutes);
app.use("/api/events", EventRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
