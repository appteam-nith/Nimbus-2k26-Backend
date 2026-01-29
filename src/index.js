import dotenv from "dotenv";
dotenv.config();

import sql from './config/db.js'

import express from 'express';
import pool from "./config/db.js";

const app = express();
const PORT = process.env.PORT || 3000;


app.get('/', (req, res) => {
  res.send('Hello, Nimbus 2k26 Backend!');
});


app.get("/test-db", async (req, res) => {
  try {
    const result = await sql`SELECT version()`;
    const { version } = result[0];
    res.send(`PostgreSQL Version: ${version}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database connection error");
  }
});




app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 