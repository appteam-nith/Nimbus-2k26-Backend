import prisma from './src/config/prisma.js';

async function main() {
  // 1. Set all player scores to 1000
  console.log("Setting all player scores to 1000...");
  const updateResult = await prisma.user.updateMany({
    data: { experience: 1000, experience_updated_at: new Date() }
  });
  console.log(`Updated ${updateResult.count} users to 1000 experience.`);

  // 2. Clear all names starting with BOT completely
  console.log("Clearing all users with names starting with 'BOT'...");
  const deleteResult = await prisma.user.deleteMany({
    where: {
      OR: [
        { full_name: { startsWith: 'BOT', mode: 'insensitive' } },
        { nickname: { startsWith: 'BOT', mode: 'insensitive' } }
      ]
    }
  });
  console.log(`Deleted ${deleteResult.count} bot users.`);

  // 3. Fetch the first 3 pages of leaderboard (Top 30 users, 10 per page)
  console.log("Fetching first 3 pages of leaderboard (Top 30)...");
  const leaderboard = await prisma.user.findMany({
    orderBy: [
      { experience: 'desc' },
      { experience_updated_at: 'asc' }
    ],
    take: 30,
    select: {
      full_name: true,
      nickname: true,
      experience: true
    }
  });

  console.log("\n--- LEADERBOARD (Top 30) ---");
  leaderboard.forEach((user, index) => {
    const name = user.nickname ? `${user.full_name} (${user.nickname})` : user.full_name;
    console.log(`${(index + 1).toString().padStart(2, ' ')}. ${name.padEnd(30, ' ')} | ${user.experience} XP`);
  });
  console.log("----------------------------");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
