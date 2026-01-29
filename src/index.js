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

app.get("/setup-test", async (req, res) => {
  try {
    // 1️⃣ Create table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        age INT
      )
    `;

    // 2️⃣ Insert test data
    const result = await sql`
      INSERT INTO users (name, age)
      VALUES
        (${ "Chetan" }, ${ 20 }),
        (${ "user" }, ${ 21 })
      RETURNING *;
    `;

    // 3️⃣ Send back the inserted rows
    res.json({
      message: "Table created and test data inserted",
      data: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 