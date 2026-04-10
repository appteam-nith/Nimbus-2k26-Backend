/**
 * Fix DB drift: run the missing steps from 20260328_add_clerk_id
 * that Prisma recorded as applied but whose SQL didn't execute.
 *
 * Usage: node test/fix-db-drift.js
 */
import prisma from '../src/config/prisma.js';

async function main() {
  console.log('Checking current column state...');

  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'User'
  `;
  const colNames = cols.map(c => c.column_name);
  console.log('Current columns:', colNames.join(', '));

  const hasClerkId  = colNames.includes('clerk_id');
  const hasPassword = colNames.includes('password');
  const hasGoogleId = colNames.includes('google_id');
  const hasResetToken = colNames.includes('reset_token');
  const hasResetExpires = colNames.includes('reset_token_expires');

  if (hasClerkId && !hasPassword && !hasGoogleId) {
    console.log('\n✓ DB is already in the correct state. No fix needed.');
    return;
  }

  console.log('\nApplying missing migration steps...');

  // Step 1: Add clerk_id if missing
  if (!hasClerkId) {
    console.log('  Adding clerk_id column...');
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerk_id" TEXT`;
    console.log('  ✓ clerk_id added');
  }

  // Step 2: Clear existing users (they have no clerk_id and cannot auth with Clerk)
  const count = await prisma.$queryRaw`SELECT COUNT(*) FROM "User"`;
  const userCount = Number(count[0].count);
  if (userCount > 0) {
    console.log(`  Found ${userCount} legacy users. Deleting them (no valid clerk_id)...`);
    await prisma.$executeRaw`DELETE FROM "User"`;
    console.log('  ✓ Legacy users cleared');
  }

  // Step 3: Enforce NOT NULL on clerk_id
  console.log('  Setting clerk_id NOT NULL...');
  await prisma.$executeRaw`ALTER TABLE "User" ALTER COLUMN "clerk_id" SET NOT NULL`;
  console.log('  ✓ NOT NULL enforced');

  // Step 4: Add unique constraint if missing
  try {
    await prisma.$executeRaw`ALTER TABLE "User" ADD CONSTRAINT "User_clerk_id_key" UNIQUE ("clerk_id")`;
    console.log('  ✓ UNIQUE constraint on clerk_id added');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('  ✓ UNIQUE constraint already exists');
    } else throw e;
  }

  // Step 5: Drop old columns if they still exist
  if (hasPassword) {
    console.log('  Dropping password column...');
    await prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "password"`;
    console.log('  ✓ password dropped');
  }
  if (hasGoogleId) {
    console.log('  Dropping google_id column...');
    await prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "google_id"`;
    console.log('  ✓ google_id dropped');
  }
  if (hasResetToken) {
    console.log('  Dropping reset_token column...');
    await prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token"`;
    console.log('  ✓ reset_token dropped');
  }
  if (hasResetExpires) {
    console.log('  Dropping reset_token_expires column...');
    await prisma.$executeRaw`ALTER TABLE "User" DROP COLUMN IF EXISTS "reset_token_expires"`;
    console.log('  ✓ reset_token_expires dropped');
  }

  // Verify
  const finalCols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'User'
    ORDER BY ordinal_position
  `;
  console.log('\n✓ Done! Final columns:', finalCols.map(c => c.column_name).join(', '));
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
