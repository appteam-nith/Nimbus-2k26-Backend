import prisma from './src/config/prisma.js';

try {
  const r = await prisma.$queryRaw`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'User' 
    ORDER BY ordinal_position
  `;
  console.log('Columns in "User" table on live DB:');
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await prisma.$disconnect();
}
