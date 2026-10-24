import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma.js';

console.log('🧪 Starting Live Media Endpoint, Access Control & Security Regression Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

function pass(name) {
  console.log(`  ✅ PASS: ${name}`);
  testsPassed++;
}

function fail(name, err) {
  console.error(`  ❌ FAIL: ${name}`);
  console.error(`     Error: ${err.message}`);
  testsFailed++;
}

const BASE_URL = process.env.API_TEST_URL || 'http://localhost:5050';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'esmms_default_jwt_secret_for_local_development_only';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || 'esmms_default_refresh_token_secret_for_local_development_only';

function createTestToken(userId, role, email) {
  return jwt.sign(
    { sub: userId, role, email },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

function createTestRefreshToken(userId, email) {
  return jwt.sign(
    { sub: userId, email, jti: crypto.randomUUID() },
    REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '12h' }
  );
}

async function runLiveTests() {
  // 1. Fetch test users from database
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  const creatorUser = await prisma.user.findFirst({ where: { role: 'COURSE_CREATOR', status: 'ACTIVE' } });
  const studentUser = await prisma.user.findFirst({ where: { role: 'USER', status: 'ACTIVE' } });

  assert(adminUser, 'Admin user must exist in database');
  assert(creatorUser, 'Creator user must exist in database');
  assert(studentUser, 'Student user must exist in database');

  const adminToken = createTestToken(adminUser.id, adminUser.role, adminUser.email);
  const creatorToken = createTestToken(creatorUser.id, creatorUser.role, creatorUser.email);
  const studentToken = createTestToken(studentUser.id, studentUser.role, studentUser.email);

  // -------------------------------------------------------------
  // Test 1: Unauthenticated Media Access (Expect 401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/uploads/lessons/sample-video.mp4`);
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.error, 'AUTH_REQUIRED', 'Error code must be AUTH_REQUIRED');
    pass('Unauthenticated access blocked (HTTP 401 AUTH_REQUIRED)');
  } catch (err) {
    fail('Unauthenticated access blocked', err);
  }

  // -------------------------------------------------------------
  // Test 2: Unauthenticated Chat Attachment Access (Expect 401)
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/uploads/chat/chat-private-doc.pdf`);
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.error, 'AUTH_REQUIRED', 'Error code must be AUTH_REQUIRED');
    pass('Unauthenticated chat attachment access blocked (HTTP 401 AUTH_REQUIRED)');
  } catch (err) {
    fail('Unauthenticated chat attachment access blocked', err);
  }

  // -------------------------------------------------------------
  // Test 3: Course Media Upload by Creator (Expect 200)
  // -------------------------------------------------------------
  let uploadedFilename = null;
  try {
    const formData = new FormData();
    const fakeBlob = new Blob(['TEST_VIDEO_STREAM_DATA_ABC123'], { type: 'video/mp4' });
    formData.append('file', fakeBlob, 'test-lecture-unit.mp4');

    const res = await fetch(`${BASE_URL}/api/v1/modules/upload-media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creatorToken}`,
      },
      body: formData,
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK from upload-media, got ${res.status}`);
    const data = await res.json();
    assert(data.success, 'Upload response must be successful');
    assert(data.filename, 'Response must include filename');
    assert(data.relativeUrl.startsWith('/uploads/lessons/'), 'relativeUrl must start with /uploads/lessons/');
    uploadedFilename = data.filename;
    pass(`Course media upload by creator (saved as: ${data.filename}, storage: ${data.storageType})`);
  } catch (err) {
    fail('Course media upload by creator', err);
  }

  // -------------------------------------------------------------
  // Test 4: Course Creator Access to Uploaded Media (Preview Mode)
  // -------------------------------------------------------------
  try {
    assert(uploadedFilename, 'Uploaded filename must exist from previous test');
    const res = await fetch(`${BASE_URL}/uploads/lessons/${uploadedFilename}?token=${creatorToken}`);
    assert.strictEqual(res.status, 200, `Expected 200 OK for creator authoring preview, got ${res.status}`);
    const corpHeader = res.headers.get('Cross-Origin-Resource-Policy');
    assert.strictEqual(corpHeader, 'cross-origin', 'Cross-Origin-Resource-Policy header must be cross-origin');
    const buffer = await res.arrayBuffer();
    assert(buffer.byteLength > 0, 'Must receive streamed content');
    pass('Creator authorized media streaming with ?token= (HTTP 200)');
  } catch (err) {
    fail('Creator authorized media streaming with ?token=', err);
  }

  // -------------------------------------------------------------
  // Test 5: Admin Authorized Retrieval with Range Request (HTTP 206)
  // -------------------------------------------------------------
  try {
    assert(uploadedFilename, 'Uploaded filename must exist');
    const res = await fetch(`${BASE_URL}/uploads/lessons/${uploadedFilename}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Range: 'bytes=0-9',
      },
    });
    assert.strictEqual(res.status, 206, `Expected 206 Partial Content for range request, got ${res.status}`);
    assert(res.headers.get('Content-Range'), 'Content-Range header must be present');
    assert.strictEqual(res.headers.get('Accept-Ranges'), 'bytes', 'Accept-Ranges must be bytes');
    pass('Admin Range streaming request (HTTP 206 Partial Content)');
  } catch (err) {
    fail('Admin Range streaming request', err);
  }

  // -------------------------------------------------------------
  // Test 6: Memory Safety & Oversized Upload (HTTP 413 PAYLOAD_TOO_LARGE)
  // -------------------------------------------------------------
  try {
    // Generate a multipart stream header indicating an oversized payload
    // Chat limit is 50MB; testing upload exceeding limit
    const oversizedBlob = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', oversizedBlob, 'oversized-archive.pdf');

    const res = await fetch(`${BASE_URL}/api/v1/chat/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
      body: formData,
    });

    assert.strictEqual(res.status, 413, `Expected 413 Payload Too Large, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.error, 'PAYLOAD_TOO_LARGE', `Error must be PAYLOAD_TOO_LARGE, got ${data.error}`);
    pass('Oversized upload rejected with HTTP 413 PAYLOAD_TOO_LARGE');
  } catch (err) {
    fail('Oversized upload rejected with HTTP 413', err);
  }

  // -------------------------------------------------------------
  // Test 7: Chat Upload & Pending In-Flight Uploader Authorization
  // -------------------------------------------------------------
  let chatFilename = null;
  try {
    const formData = new FormData();
    const fakeBlob = new Blob(['CONFIDENTIAL_RESEARCH_PAPER_IN_FLIGHT'], { type: 'application/pdf' });
    formData.append('file', fakeBlob, 'confidential-research.pdf');

    const res = await fetch(`${BASE_URL}/api/v1/chat/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
      body: formData,
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK from chat upload, got ${res.status}`);
    const data = await res.json();
    chatFilename = data.file.relativeUrl.replace('/uploads/chat/', '');

    // 7a. Verified Uploader (Student) can preview the unlinked file
    const uploaderRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${studentToken}`);
    assert.strictEqual(uploaderRes.status, 200, `Verified uploader must be allowed to preview in-flight upload, got ${uploaderRes.status}`);

    // 7b. Arbitrary 3rd party user (Creator) is FORBIDDEN before message dispatch
    const thirdPartyRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${creatorToken}`);
    assert.strictEqual(thirdPartyRes.status, 403, `Arbitrary 3rd party must get 403 Forbidden for unlinked upload, got ${thirdPartyRes.status}`);
    const thirdPartyData = await thirdPartyRes.json();
    assert.strictEqual(thirdPartyData.error, 'FORBIDDEN_CHAT_ATTACHMENT', 'Error must be FORBIDDEN_CHAT_ATTACHMENT');

    // 7c. Admin can inspect unlinked upload
    const adminInspectRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${adminToken}`);
    assert.strictEqual(adminInspectRes.status, 200, `Admin must have audit access to unlinked upload, got ${adminInspectRes.status}`);

    pass('Pending chat attachment authorization (uploader/admin allowed, arbitrary users forbidden with HTTP 403)');
  } catch (err) {
    fail('Pending chat attachment authorization', err);
  }

  // -------------------------------------------------------------
  // Test 8: Direct Chat Message Privacy Enforcement After Send
  // -------------------------------------------------------------
  try {
    assert(chatFilename, 'Chat filename must exist');
    // Dispatch direct message between student and admin
    const directMsg = await prisma.chatMessage.create({
      data: {
        type: 'DIRECT',
        senderId: studentUser.id,
        senderName: studentUser.name,
        senderRole: studentUser.role,
        recipientId: adminUser.id,
        recipientName: adminUser.name,
        recipientRole: adminUser.role,
        content: 'Confidential attachment for admin eyes only.',
        fileUrl: `/uploads/chat/${chatFilename}`,
        fileName: 'confidential-research.pdf',
        fileType: 'application/pdf',
        fileSize: 37,
      },
    });

    // Student (sender) -> Allowed
    const studentRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${studentToken}`);
    assert.strictEqual(studentRes.status, 200, `Sender must be allowed to access direct chat attachment, got ${studentRes.status}`);

    // Admin (recipient) -> Allowed
    const adminRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${adminToken}`);
    assert.strictEqual(adminRes.status, 200, `Recipient must be allowed to access direct chat attachment, got ${adminRes.status}`);

    // Creator (unauthorized 3rd-party user) -> Forbidden
    const creatorRes = await fetch(`${BASE_URL}/uploads/chat/${chatFilename}?token=${creatorToken}`);
    assert.strictEqual(creatorRes.status, 403, `Unauthorized 3rd-party must get 403 Forbidden, got ${creatorRes.status}`);

    pass('Direct chat message privacy after send (sender & recipient allowed, 3rd party forbidden)');

    // Cleanup test chat message
    await prisma.chatMessage.delete({ where: { id: directMsg.id } });
  } catch (err) {
    fail('Direct chat message privacy after send', err);
  }

  // -------------------------------------------------------------
  // Test 9: PDF Detection with URL Query Parameters
  // -------------------------------------------------------------
  try {
    const testCases = [
      { url: 'https://api.qualiva.com/uploads/lessons/sample-doc.pdf?token=abc123xyz&download=true', expected: true },
      { url: '/uploads/lessons/report-final.PDF?token=jwt_here', expected: true },
      { url: '/uploads/lessons/lecture-video.mp4?token=jwt_here', expected: false },
    ];

    for (const tc of testCases) {
      const isPdf = tc.url?.split('?')[0].toLowerCase().endsWith('.pdf');
      assert.strictEqual(isPdf, tc.expected, `PDF detection failed for ${tc.url}`);
    }
    pass('PDF extension detection works reliably with query parameters');
  } catch (err) {
    fail('PDF extension detection works reliably with query parameters', err);
  }

  // -------------------------------------------------------------
  // Test 10: Revoked Session Rejection on Refresh-Cookie Fallback
  // -------------------------------------------------------------
  try {
    assert(uploadedFilename, 'Uploaded filename must exist');
    const rawRefreshToken = createTestRefreshToken(creatorUser.id, creatorUser.email);
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // 10a: Create an ACTIVE (unrevoked) session
    const activeSession = await prisma.activeSession.create({
      data: {
        userId: creatorUser.id,
        refreshTokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });

    const activeCookieRes = await fetch(`${BASE_URL}/uploads/lessons/${uploadedFilename}`, {
      headers: {
        Cookie: `esmms_refresh_token=${rawRefreshToken}`,
      },
    });
    assert.strictEqual(activeCookieRes.status, 200, `Active unrevoked session cookie must be accepted, got ${activeCookieRes.status}`);

    // 10b: Revoke the session
    await prisma.activeSession.update({
      where: { id: activeSession.id },
      data: { isRevoked: true },
    });

    const revokedCookieRes = await fetch(`${BASE_URL}/uploads/lessons/${uploadedFilename}`, {
      headers: {
        Cookie: `esmms_refresh_token=${rawRefreshToken}`,
      },
    });
    assert.strictEqual(revokedCookieRes.status, 401, `Revoked session cookie must be rejected with 401, got ${revokedCookieRes.status}`);
    const revokedData = await revokedCookieRes.json();
    assert.strictEqual(revokedData.error, 'AUTH_REQUIRED', 'Error code must be AUTH_REQUIRED');

    // Cleanup session
    await prisma.activeSession.delete({ where: { id: activeSession.id } });
    pass('Session revocation enforcement on refresh cookie (active allowed, revoked rejected with HTTP 401)');
  } catch (err) {
    fail('Session revocation enforcement on refresh cookie', err);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=============================================');
  console.log(`Live Tests Results: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log('=============================================\n');

  try {
    await prisma.$disconnect();
  } catch {}

  process.exit(testsFailed > 0 ? 1 : 0);
}

runLiveTests().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
