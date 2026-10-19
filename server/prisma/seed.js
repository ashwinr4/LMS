import { prisma } from '../src/utils/prisma.js';
import { logger } from '../src/utils/logger.js';
import { bootstrapAdministrator } from './bootstrapAdmin.js';

async function main() {
  console.log('🌱 Starting safe, non-destructive Qualiva LMS database seed routine...');

  // 1. Check & execute Administrator Bootstrap if credentials provided
  await bootstrapAdministrator();

  console.log('✅ Database seed routine completed safely without removing existing data.');
}

main()
  .catch((e) => {
    console.error('Database Clean Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
