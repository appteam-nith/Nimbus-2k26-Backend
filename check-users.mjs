import dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  select: { user_id: true, google_id: true, email: true, full_name: true, created_at: true },
  orderBy: { created_at: "desc" },
  take: 10,
});
process.stdout.write("USER COUNT: " + users.length + "\n");
for (const u of users) {
  process.stdout.write(
    `id=${u.user_id} | google_id=${u.google_id ?? "NULL"} | email=${u.email} | name=${u.full_name} | created=${u.created_at}\n`
  );
}
await prisma.$disconnect();
