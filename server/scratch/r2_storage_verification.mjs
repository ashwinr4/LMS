import fs from 'fs';
import path from 'path';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import {
  isR2Configured,
  getR2BucketName,
  getR2Endpoint,
  generateSafeFilename,
  uploadFile,
  getFileStream,
  generatePresignedDownloadUrl,
} from '../src/utils/r2Storage.js';
import { getStorageDiagnostics } from '../src/utils/storage.js';

console.log('🧪 Starting Cloudflare R2 & Media Storage Test Suite...\n');

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

async function runTests() {
  // -------------------------------------------------------------
  // Test 1: Filename Sanitization & Collision Resistance
  // -------------------------------------------------------------
  try {
    const rawName = 'Advanced Quantum Lecture #1 (Draft v2.0) [Final].mp4';
    const { filename, objectKey } = generateSafeFilename('lessons', rawName);

    assert(objectKey.startsWith('lessons/'), 'Object key must start with category prefix');
    assert(filename.endsWith('.mp4'), 'Filename must preserve extension');
    assert(!filename.includes('#'), 'Filename must not contain special character #');
    assert(!filename.includes('('), 'Filename must not contain parentheses');
    assert(!filename.includes('['), 'Filename must not contain brackets');
    assert(!filename.includes(' '), 'Filename must not contain spaces');

    // Collision resistance check: 100 iterations generated in loop
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
      const generated = generateSafeFilename('lessons', 'same_file.pdf');
      assert(!keys.has(generated.filename), `Collision detected on iteration ${i}`);
      keys.add(generated.filename);
    }
    pass('Filename sanitization and collision resistance');
  } catch (err) {
    fail('Filename sanitization and collision resistance', err);
  }

  // -------------------------------------------------------------
  // Test 2: Storage Diagnostics & Environment Detection
  // -------------------------------------------------------------
  try {
    const diagnostics = getStorageDiagnostics();
    assert(diagnostics.rootDir, 'Root upload directory must be defined');
    assert(typeof diagnostics.isWritable === 'boolean', 'isWritable must be boolean');
    assert(typeof diagnostics.isR2Active === 'boolean', 'isR2Active must be boolean');
    assert(
      diagnostics.mode === 'cloudflare-r2' ||
      diagnostics.mode === 'persistent-mount' ||
      diagnostics.mode === 'local-ephemeral',
      'Diagnostic mode must reflect storage configuration'
    );
    pass(`Storage Diagnostics resolution (mode: ${diagnostics.mode}, R2 configured: ${isR2Configured()})`);
  } catch (err) {
    fail('Storage Diagnostics resolution', err);
  }

  // -------------------------------------------------------------
  // Test 3: Local Storage Fallback when R2 is not configured
  // -------------------------------------------------------------
  try {
    // When R2 credentials are not set in local dev, uploadFile saves to local disk
    const mockLessonBuffer = Buffer.from('FAKE_VIDEO_CONTENT_BINARY_DATA_FOR_TESTING');
    const mockFile = {
      buffer: mockLessonBuffer,
      originalname: 'biology-lecture-unit1.mp4',
      mimetype: 'video/mp4',
      size: mockLessonBuffer.length,
    };

    const uploadResult = await uploadFile(mockFile, 'lessons');
    assert(uploadResult.filename, 'Must return a generated filename');
    assert(uploadResult.relativeUrl.startsWith('/uploads/lessons/'), 'Relative URL must match /uploads/lessons/');
    assert(uploadResult.mimetype === 'video/mp4', 'MIME type must be preserved');
    assert(uploadResult.size === mockLessonBuffer.length, 'Size must match payload');

    // Retrieve file stream using getFileStream
    const streamResult = await getFileStream('lessons', uploadResult.filename);
    assert(streamResult, 'Must find and return stream result');
    assert(streamResult.contentType === 'video/mp4', `Content type must be video/mp4, got ${streamResult.contentType}`);
    assert(streamResult.acceptRanges === 'bytes', 'Must support byte ranges');
    assert(streamResult.contentLength === mockLessonBuffer.length, 'Content length must match');
    assert(streamResult.statusCode === 200, 'Full retrieval status code must be 200');

    // Test HTTP Range streaming (e.g. video scrubbing)
    const rangeResult = await getFileStream('lessons', uploadResult.filename, 'bytes=0-9');
    assert(rangeResult, 'Must return range result');
    assert(rangeResult.statusCode === 206, 'Range request status code must be 206 Partial Content');
    assert(rangeResult.contentLength === 10, 'Chunk length for bytes 0-9 must be 10');
    assert(rangeResult.contentRange.startsWith('bytes 0-9/'), 'Content-Range header must be present');

    pass('Local storage fallback and HTTP Range streaming for lesson videos');
  } catch (err) {
    fail('Local storage fallback and HTTP Range streaming for lesson videos', err);
  }

  // -------------------------------------------------------------
  // Test 4: Chat Attachment Upload and Storage Fallback
  // -------------------------------------------------------------
  try {
    const mockChatBuffer = Buffer.from('CONFIDENTIAL_CHAT_ATTACHMENT_PDF');
    const mockChatFile = {
      buffer: mockChatBuffer,
      originalname: 'project-notes.pdf',
      mimetype: 'application/pdf',
      size: mockChatBuffer.length,
    };

    const chatUploadResult = await uploadFile(mockChatFile, 'chat');
    assert(chatUploadResult.filename.startsWith('chat-'), 'Chat filename must have chat- prefix');
    assert(chatUploadResult.relativeUrl.startsWith('/uploads/chat/'), 'Relative URL must be /uploads/chat/');

    const chatStreamResult = await getFileStream('chat', chatUploadResult.filename);
    assert(chatStreamResult, 'Must find uploaded chat file');
    assert(chatStreamResult.contentType === 'application/pdf', 'Content type must be application/pdf');

    pass('Chat attachment upload and streaming fallback');
  } catch (err) {
    fail('Chat attachment upload and streaming fallback', err);
  }

  // -------------------------------------------------------------
  // Test 5: Production R2 Failure Strict Handling (Requirement 7)
  // -------------------------------------------------------------
  try {
    // If R2 is configured but the upload throws an error (e.g. network timeout or invalid bucket),
    // uploadFile must THROW and MUST NOT silently fall back to ephemeral disk
    const originalEnv = { ...process.env };
    process.env.R2_ACCESS_KEY_ID = 'test_access_key';
    process.env.R2_SECRET_ACCESS_KEY = 'test_secret_key';
    process.env.R2_BUCKET_NAME = 'qualiva-uploads';
    process.env.R2_ENDPOINT = 'https://invalid-non-existent-endpoint.r2.cloudflarestorage.com';

    let errorThrown = false;
    let thrownMessage = '';
    try {
      const mockTestFile = {
        buffer: Buffer.from('test_data'),
        originalname: 'test.mp4',
        mimetype: 'video/mp4',
        size: 9,
      };
      await uploadFile(mockTestFile, 'lessons');
    } catch (err) {
      errorThrown = true;
      thrownMessage = err.message;
    } finally {
      // Restore environment
      process.env = originalEnv;
    }

    assert(errorThrown, 'uploadFile MUST throw an error when R2 upload fails in production');
    assert(thrownMessage.includes('R2_UPLOAD_FAILED'), `Error must be R2_UPLOAD_FAILED, got: ${thrownMessage}`);
    pass('Strict error handling on R2 failure (does not silently write to ephemeral disk in production)');
  } catch (err) {
    fail('Strict error handling on R2 failure', err);
  }

  // -------------------------------------------------------------
  // Test 6: Presigned URL Generation
  // -------------------------------------------------------------
  try {
    const originalEnv = { ...process.env };
    process.env.R2_ACCESS_KEY_ID = 'test_mock_key_id';
    process.env.R2_SECRET_ACCESS_KEY = 'test_mock_secret_key_1234567890';
    process.env.R2_BUCKET_NAME = 'qualiva-uploads';
    process.env.R2_ENDPOINT = 'https://fake-account-id.r2.cloudflarestorage.com';

    const presignedUrl = await generatePresignedDownloadUrl('lessons', 'lecture-test.mp4', 300);
    assert(presignedUrl.includes('qualiva-uploads'), 'Presigned URL must reference bucket');
    assert(presignedUrl.includes('X-Amz-Signature') || presignedUrl.includes('fake-account-id'), 'Presigned URL must contain S3 signing parameters');

    // Restore environment
    process.env = originalEnv;
    pass('Presigned URL generation using AWS SDK v3 Request Presigner');
  } catch (err) {
    fail('Presigned URL generation using AWS SDK v3 Request Presigner', err);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=============================================');
  console.log(`Test Results: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log('=============================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
