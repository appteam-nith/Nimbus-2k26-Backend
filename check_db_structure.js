import { PrismaClient } from '@prisma/client';

async function checkTables() {
  const prisma = new PrismaClient();

  try {
    // Check if GamePlayer table exists and get its structure
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'GamePlayer'
      ORDER BY ordinal_position;
    `;

    console.log('GamePlayer table columns:');
    console.log(result);

    // Check if isBot column exists
    const hasIsBot = result.some(col => col.column_name === 'isBot');
    console.log('Has isBot column:', hasIsBot);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTables();