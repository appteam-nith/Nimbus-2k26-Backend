// db.js
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config();


// Create a connection using DATABASE_URL
const sql = neon(process.env.DATABASE_URL);

export default sql;
