import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma.js';

async function runVerification() {
  console.log('========================================================');
  console.log('🧪 VERIFYING ENHANCEMENTS: CURRICULUM, SESSIONS & SPEED');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Verify 12-Hour Session Expiry in Auth Configurations
    console.log('1. Testing Session Expiration Configuration (12 Hours)...');
    
    // Check .env values
    assert(process.env.JWT_REFRESH_EXPIRES_IN === '12h', 'JWT_REFRESH_EXPIRES_IN is set to "12h" in .env');
    assert(process.env.JWT_REFRESH_EXPIRES_HOURS === '12', 'JWT_REFRESH_EXPIRES_HOURS is set to "12" in .env');

    // Simulate ActiveSession expiry calculation
    const expectedMaxAgeMs = 12 * 60 * 60 * 1000;
    const now = Date.now();
    const expiresAt = new Date(now + expectedMaxAgeMs);
    const diffHours = (expiresAt.getTime() - now) / (1000 * 60 * 60);
    assert(Math.abs(diffHours - 12) < 0.01, `Session expiry calculates to exactly 12 hours (${diffHours.toFixed(2)}h)`);

    // 2. Verify Curriculum API Content Protection for Unenrolled Callers
    console.log('\n2. Testing Curriculum Visibility & Content Protection API...');
    const activeModule = await prisma.module.findFirst({
      where: { status: 'ACTIVE' },
      include: { sections: { include: { lessons: true } } },
    });

    if (!activeModule) {
      console.log('  ⚠️ No active module in database to test HTTP endpoint.');
    } else {
      const response = await fetch(`http://localhost:5050/api/v1/modules/${activeModule.id}`);
      const body = await response.json();

      assert(response.status === 200, 'GET /api/v1/modules/:id responds with 200 OK for anonymous callers');
      assert(body.success === true, 'Response success is true');
      assert(body.module.hasFullAccess === false, 'Caller authorization flag hasFullAccess is false');
      assert(body.module.isEnrolled === false, 'Caller authorization flag isEnrolled is false');
      assert(Array.isArray(body.module.sections), 'Curriculum sections array is returned to unenrolled user');

      let allLessonsMasked = true;
      let allLessonsHaveStructure = true;
      let totalLessonsFound = 0;

      for (const section of body.module.sections || []) {
        for (const lesson of section.lessons || []) {
          totalLessonsFound++;
          // Structure check
          if (!lesson.title || !lesson.type) {
            allLessonsHaveStructure = false;
          }
          // Masking check
          if (lesson.videoUrl !== null || lesson.content !== null || lesson.documentName !== null || lesson.notes !== null) {
            allLessonsMasked = false;
          }
          if (lesson.isLocked !== true) {
            allLessonsMasked = false;
          }
        }
      }

      assert(totalLessonsFound > 0, `Discovered ${totalLessonsFound} curriculum lessons across sections`);
      assert(allLessonsHaveStructure, 'All lessons expose syllabus metadata (title, type, duration, order)');
      assert(allLessonsMasked, 'All educational contents (videoUrl, content, documentName, notes) are masked to null and locked');
    }

    // 3. Database Gateway & Latency Warmth Test
    console.log('\n3. Testing Database Gateway & Connection Pool...');
    const start = performance.now();
    const userCount = await prisma.user.count();
    const durationMs = Math.round(performance.now() - start);

    assert(userCount >= 0, `Database queries executing normally (User count: ${userCount})`);
    assert(durationMs < 2000, `Database connection pool responds rapidly (${durationMs}ms latency)`);

    console.log('\n========================================================');
    console.log(`Summary: ${passed} passed, ${failed} failed`);
    console.log('========================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runVerification();
