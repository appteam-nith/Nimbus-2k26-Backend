import fs from "fs";
import path from "path";
import sql from "../src/config/db.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createTables() {
  try {
    const schemaPath = path.join(__dirname, "../sql/data.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    console.log("Running database bootstrap...");

    await sql.unsafe(schema);

    console.log("Tables created successfully.");
    process.exit(0);

  } catch (err) {
    console.error("Schema bootstrap failed:", err);
    process.exit(1);
  }
}

createTables();
