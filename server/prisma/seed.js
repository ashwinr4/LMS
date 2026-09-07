import { prisma } from '../src/utils/prisma.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  console.log('🧹 Clearing all temporary demo data from Neon PostgreSQL database...');

  await prisma.certificate.deleteMany({});
  await prisma.assessmentSubmission.deleteMany({});
  await prisma.assessment.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.activeSession.deleteMany({});
  await prisma.courseEnrollmentRequest.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.lesson.deleteMany({});
  await prisma.section.deleteMany({});
  await prisma.module.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✅ Neon PostgreSQL Database cleaned! Ready for fresh enterprise registration and courses.');
}

main()
  .catch((e) => {
    console.error('Database Clean Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
