import prisma from '../src/config/prisma.js';

try {
  // Check actual columns
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'User' 
    ORDER BY ordinal_position
  `;
  console.log('\n=== Actual columns in "User" table ===');
  cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`));

  // Check migration history
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
    FROM _prisma_migrations
    ORDER BY finished_at ASC
  `;
  console.log('\n=== Applied migrations ===');
  migrations.forEach(m => console.log(`  ${m.migration_name} | finished: ${m.finished_at} | steps: ${m.applied_steps_count} | rolled_back: ${m.rolled_back_at}`));

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await prisma.$disconnect();
}
