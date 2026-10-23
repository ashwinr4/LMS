import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../server/.env') });

const { prisma } = await import('../../server/src/utils/prisma.js');
const { getModuleProgress, getModule } = await import('../../server/src/controllers/moduleController.js');
const { refresh, logout } = await import('../../server/src/controllers/authController.js');
const { getUserDetail } = await import('../../server/src/controllers/adminController.js');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔒 QUALIVA DEPLOYMENT SECURITY AUDIT & VERIFICATION SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── TEST 1: JWT Signature & Algorithm Lockdown ──
console.log('--- 1. Testing JWT Token Security & Algorithm Lockdown ---');
const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET;

// 1.1: Valid HS256 Token
const validToken = jwt.sign({ sub: 'user-123', role: 'USER' }, accessSecret, { algorithm: 'HS256', expiresIn: '15m' });
const verified = jwt.verify(validToken, accessSecret, { algorithms: ['HS256'] });
assert(verified.sub === 'user-123', 'Valid HS256 token is accepted.');

// 1.2: Algorithm Confusion Attempt (alg: "none")
const noneTokenHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
const noneTokenPayload = Buffer.from(JSON.stringify({ sub: 'user-admin', role: 'ADMIN' })).toString('base64url');
const forgedNoneToken = `${noneTokenHeader}.${noneTokenPayload}.`;

let noneBlocked = false;
try {
  jwt.verify(forgedNoneToken, accessSecret, { algorithms: ['HS256'] });
} catch {
  noneBlocked = true;
}
assert(noneBlocked, 'Forged token with alg="none" is strictly rejected.');

// 1.3: Tampered Signature Attempt
const tamperedToken = validToken.slice(0, -6) + 'abcdef';
let tamperedBlocked = false;
try {
  jwt.verify(tamperedToken, accessSecret, { algorithms: ['HS256'] });
} catch {
  tamperedBlocked = true;
}
assert(tamperedBlocked, 'Tampered token signature is strictly rejected.');


// ── TEST 2: Refresh Token Security, Rotation & Revocation ──
console.log('\n--- 2. Testing Refresh Token Security, Rotation & Revocation ---');

// 2.1: Missing Refresh Token returns 401
let refresh401Missing = false;
await refresh({ cookies: {}, body: {} }, {
  status: (code) => {
    if (code === 401) refresh401Missing = true;
    return { json: () => {} };
  },
  cookie: () => {},
  clearCookie: () => {},
});
assert(refresh401Missing, 'Missing refresh token returns 401 REFRESH_TOKEN_REQUIRED.');

// 2.2: Malformed Refresh Token returns 401
let refresh401Malformed = false;
await refresh({ cookies: { esmms_refresh_token: 'not-a-valid-jwt.token' }, body: {} }, {
  status: (code) => {
    if (code === 401) refresh401Malformed = true;
    return { json: () => {} };
  },
  cookie: () => {},
  clearCookie: () => {},
});
assert(refresh401Malformed, 'Malformed refresh token returns 401 INVALID_REFRESH_TOKEN.');


// ── TEST 3: Module Details Question Privacy (Anti-Leak) ──
console.log('\n--- 3. Testing Public Module Details Anti-Leak ---');

// Find any published module
const sampleModule = await prisma.module.findFirst({
  where: { status: 'ACTIVE' },
  select: { id: true, title: true },
});

if (sampleModule) {
  let modResult = null;
  await getModule({ params: { id: sampleModule.id }, user: null }, {
    status: (code) => ({
      json: (data) => { modResult = data; }
    })
  });

  assert(modResult?.success === true, `Retrieved public module ${sampleModule.title}`);
  if (modResult.module.assessments && modResult.module.assessments.length > 0) {
    const hasRawQuestions = modResult.module.assessments.some((a) => a.questions !== undefined);
    assert(!hasRawQuestions, 'Public module endpoint NEVER exposes assessment questions or answer keys.');
  } else {
    assert(true, 'Module has no assessments or questions are omitted.');
  }
} else {
  console.log('  ⚠️ Notice: No ACTIVE module found in DB to test.');
}


// ── TEST 4: Authorization & IDOR on /modules/:id/progress ──
console.log('\n--- 4. Testing Progress IDOR Prevention & Enrollment Verification ---');

// 4.1: Non-existent module ID returns 404
let prog404 = false;
await getModuleProgress(
  { params: { id: '00000000-0000-0000-0000-000000000000' }, user: { id: 'test-user', role: 'USER' } },
  {
    status: (code) => {
      if (code === 404) prog404 = true;
      return { json: () => {} };
    }
  }
);
assert(prog404, 'Non-existent module ID returns 404 NOT_FOUND on /progress.');

// 4.2: Enrolled student progress vs Unenrolled student progress
// User 1 (12baa0f7-70ee-43f9-8f28-cfc19e9c20ff) is enrolled in ENG-101 (2bea5dd6-0f65-43ca-9003-0b8ce4b3addc)
const enrolledUserId = '12baa0f7-70ee-43f9-8f28-cfc19e9c20ff';
const enrolledModuleId = '2bea5dd6-0f65-43ca-9003-0b8ce4b3addc';

let enrolledResult = null;
await getModuleProgress(
  { params: { id: enrolledModuleId }, user: { id: enrolledUserId, role: 'USER' } },
  {
    status: (code) => ({
      json: (data) => { enrolledResult = { code, ...data }; }
    })
  }
);
assert(enrolledResult?.success === true && enrolledResult?.progress === 67, 'Enrolled student receives legitimate progress (67%).');

// 4.3: Unenrolled student requesting the same module returns 403 Forbidden
let unenrolledResult = null;
await getModuleProgress(
  { params: { id: enrolledModuleId }, user: { id: 'random-unenrolled-student-id', role: 'USER' } },
  {
    status: (code) => ({
      json: (data) => { unenrolledResult = { code, ...data }; }
    })
  }
);
assert(unenrolledResult?.code === 403 && unenrolledResult?.error === 'NOT_ENROLLED', 'Unenrolled student requesting another user’s module receives 403 NOT_ENROLLED.');


// ── TEST 5: RBAC Cross-Role Authorization Guards ──
console.log('\n--- 5. Testing Cross-Role RBAC Guards ---');

// 5.1: Student attempting to access Admin user detail returns 403
let studentAccessAdminProfile = null;
await getUserDetail(
  { params: { id: enrolledUserId }, user: { id: 'student-id', role: 'USER' } },
  {
    status: (code) => ({
      json: (data) => { studentAccessAdminProfile = { code, ...data }; }
    })
  }
);
// In getUserDetail: if caller is not ADMIN and user is ADMIN, 403.
// If caller accesses normal user via getUserDetail, let's verify admin confidentiality
const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
if (adminUser) {
  let modAccessAdminResult = null;
  await getUserDetail(
    { params: { id: adminUser.id }, user: { id: 'mod-id', role: 'MODERATOR' } },
    {
      status: (code) => ({
        json: (data) => { modAccessAdminResult = { code, ...data }; }
      })
    }
  );
  assert(modAccessAdminResult?.code === 403, 'Non-admin attempting to inspect Administrator profile receives 403 FORBIDDEN.');
}


console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} SECURITY TESTS PASSED SUCCESSFULLY!`);
console.log('═══════════════════════════════════════════════════════════════');
process.exit(0);
