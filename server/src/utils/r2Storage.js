import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from './logger.js';
import { getUploadRootDir, getUploadDir, resolveMediaUrl } from './storage.js';

let s3ClientInstance = null;

/**
 * Checks whether Cloudflare R2 environment variables are configured.
 * Does not expose or log secret values.
 */
export function isR2Configured() {
  const hasKeys = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
  const hasEndpoint = Boolean(process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID);
  return hasKeys && hasEndpoint;
}

/**
 * Returns the configured R2 bucket name, defaulting to 'qualiva-uploads'.
 */
export function getR2BucketName() {
  return process.env.R2_BUCKET_NAME || 'qualiva-uploads';
}

/**
 * Resolves the S3-compatible R2 endpoint URL from environment variables.
 */
export function getR2Endpoint() {
  if (process.env.R2_ENDPOINT && process.env.R2_ENDPOINT.trim()) {
    return process.env.R2_ENDPOINT.trim().replace(/\/$/, '');
  }
  if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCOUNT_ID.trim()) {
    return `https://${process.env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`;
  }
  return null;
}

/**
 * Lazily instantiates and returns the AWS S3 client configured for Cloudflare R2.
 */
export function getR2Client() {
  if (!isR2Configured()) {
    return null;
  }

  if (!s3ClientInstance) {
    const endpoint = getR2Endpoint();
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
    logger.info('☁️ Cloudflare R2 Storage Client initialized successfully.');
  }

  return s3ClientInstance;
}

/**
 * Generates a safe, collision-resistant filename and object key.
 * Preserves the file extension, sanitizes characters, and adds timestamp + random entropy.
 *
 * @param {string} category - 'lessons' or 'chat'
 * @param {string} originalFilename - Original filename from client
 * @returns {{ filename: string, objectKey: string }}
 */
export function generateSafeFilename(category, originalFilename = 'file') {
  const ext = path.extname(originalFilename || '').toLowerCase();
  const rawBase = path.basename(originalFilename || 'upload', ext);
  const sanitizedBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) || 'resource';
  const timestamp = Date.now();
  const entropy = crypto.randomBytes(4).toString('hex');

  const prefix = category === 'chat' ? 'chat-' : '';
  const filename = `${prefix}${timestamp}-${entropy}-${sanitizedBase}${ext}`;
  const objectKey = `${category}/${filename}`;

  return { filename, objectKey };
}

/**
 * Uploads a file buffer either to Cloudflare R2 (production) or local disk (local dev fallback).
 *
 * @param {object} file - Multer memory file object { buffer, originalname, mimetype, size }
 * @param {string} category - 'lessons' | 'chat'
 * @returns {Promise<{ storageType: string, filename: string, objectKey: string, relativeUrl: string, fileUrl: string }>}
 */
export async function uploadFile(file, category = 'lessons') {
  if (!file || !file.buffer) {
    throw new Error('INVALID_FILE_PAYLOAD: No file buffer available for upload.');
  }

  const { filename, objectKey } = generateSafeFilename(category, file.originalname);
  const relativeUrl = `/uploads/${category}/${filename}`;
  const resolvedUrl = resolveMediaUrl(relativeUrl);

  // 1. If Cloudflare R2 is configured, upload directly to the private R2 bucket
  if (isR2Configured()) {
    const client = getR2Client();
    const bucket = getR2BucketName();

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
          Metadata: {
            originalName: encodeURIComponent(file.originalname || filename),
            uploadedAt: new Date().toISOString(),
          },
        })
      );

      logger.info(`✅ [R2 Storage] File uploaded to private bucket [${bucket}]: ${objectKey} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

      return {
        storageType: 'r2',
        filename,
        objectKey,
        relativeUrl,
        fileUrl: resolvedUrl,
        size: file.size,
        mimetype: file.mimetype,
        originalName: file.originalname,
      };
    } catch (err) {
      logger.error(`❌ [R2 Storage] Upload failed for ${objectKey}: ${err.message}`);
      // Do NOT silently fall back to ephemeral disk when R2 is explicitly configured in production
      throw new Error(`R2_UPLOAD_FAILED: Cloudflare R2 storage upload failed: ${err.message}`);
    }
  }

  // 2. If R2 is NOT configured (e.g. local development without R2 credentials), save to local disk
  try {
    const targetDir = getUploadDir(category);
    const targetPath = path.join(targetDir, filename);

    await fs.promises.writeFile(targetPath, file.buffer);
    logger.info(`💾 [Local Storage] File saved locally (R2 not configured): ${targetPath} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

    return {
      storageType: 'local',
      filename,
      objectKey,
      relativeUrl,
      fileUrl: resolvedUrl,
      size: file.size,
      mimetype: file.mimetype,
      originalName: file.originalname,
    };
  } catch (err) {
    logger.error(`❌ [Local Storage] Disk write failed for ${filename}: ${err.message}`);
    throw new Error(`LOCAL_WRITE_FAILED: Failed to write file to local disk: ${err.message}`);
  }
}

/**
 * Retrieves a file stream with HTTP Range support from either Cloudflare R2 or local disk fallback.
 *
 * @param {string} category - 'lessons' | 'chat'
 * @param {string} filename - The target filename
 * @param {string} [rangeHeader] - Optional HTTP Range header for video scrubbing/streaming
 * @returns {Promise<{ stream: any, contentType: string, contentLength: number, contentRange?: string, acceptRanges: string, statusCode: number } | null>}
 */
export async function getFileStream(category, filename, rangeHeader = null) {
  const safeFilename = path.basename(filename);
  const objectKey = `${category}/${safeFilename}`;

  // 1. Attempt retrieval from Cloudflare R2 if configured
  if (isR2Configured()) {
    const client = getR2Client();
    const bucket = getR2BucketName();

    try {
      const commandInput = {
        Bucket: bucket,
        Key: objectKey,
      };

      if (rangeHeader) {
        commandInput.Range = rangeHeader;
      }

      const response = await client.send(new GetObjectCommand(commandInput));

      return {
        stream: response.Body,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
        contentRange: response.ContentRange,
        acceptRanges: 'bytes',
        statusCode: rangeHeader && response.ContentRange ? 206 : 200,
        source: 'r2',
      };
    } catch (err) {
      // If object not found in R2, proceed to check local disk fallback (legacy files)
      if (err.name !== 'NoSuchKey' && err.name !== 'NotFound') {
        logger.warn(`[R2 Storage] GetObject notice for ${objectKey}: ${err.message}`);
      }
    }
  }

  // 2. Check local disk fallback (for legacy files or local development)
  const localDir = getUploadDir(category);
  const localPath = path.join(localDir, safeFilename);

  if (fs.existsSync(localPath)) {
    try {
      const stat = await fs.promises.stat(localPath);
      const totalSize = stat.size;
      const ext = path.extname(safeFilename).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mov': 'video/quicktime',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(localPath, { start, end });

        return {
          stream,
          contentType,
          contentLength: chunkSize,
          contentRange: `bytes ${start}-${end}/${totalSize}`,
          acceptRanges: 'bytes',
          statusCode: 206,
          source: 'local',
        };
      }

      const stream = fs.createReadStream(localPath);
      return {
        stream,
        contentType,
        contentLength: totalSize,
        acceptRanges: 'bytes',
        statusCode: 200,
        source: 'local',
      };
    } catch (err) {
      logger.error(`[Local Storage] Error reading local file ${localPath}: ${err.message}`);
    }
  }

  return null;
}

/**
 * Generates a short-lived presigned download URL for private R2 objects.
 *
 * @param {string} category - 'lessons' | 'chat'
 * @param {string} filename - Target filename
 * @param {number} [expiresIn=3600] - Expiration duration in seconds (default 1 hour)
 * @returns {Promise<string>}
 */
export async function generatePresignedDownloadUrl(category, filename, expiresIn = 3600) {
  if (!isR2Configured()) {
    return resolveMediaUrl(`/uploads/${category}/${filename}`);
  }

  const client = getR2Client();
  const bucket = getR2BucketName();
  const objectKey = `${category}/${path.basename(filename)}`;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn });
}
