import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

/**
 * Enterprise File Storage & Media URL Abstraction
 * Handles configurable persistent volume mounts and cross-origin media URL generation.
 */

// 1. Resolve Root Upload Directory
export function getUploadRootDir() {
  const customPath = process.env.STORAGE_PATH || process.env.UPLOAD_DIR;
  const rootDir = customPath ? path.resolve(customPath) : path.resolve('uploads');

  if (!fs.existsSync(rootDir)) {
    try {
      fs.mkdirSync(rootDir, { recursive: true });
    } catch (err) {
      logger.error(`Failed to create root storage directory [${rootDir}]: ${err.message}`);
    }
  }

  return rootDir;
}

// 2. Resolve Specific Subdirectory (e.g., 'lessons', 'chat')
export function getUploadDir(subfolder = '') {
  const root = getUploadRootDir();
  const dir = subfolder ? path.join(root, subfolder) : root;

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      logger.error(`Failed to create subfolder directory [${dir}]: ${err.message}`);
    }
  }

  return dir;
}

// 3. Media URL Resolution
// Formats public URL depending on whether frontend and backend are on different domains.
// Uses explicitly configured trusted host; NEVER trusts arbitrary incoming request Host headers.
export function resolveMediaUrl(subpath = '', _req = null) {
  if (!subpath || typeof subpath !== 'string') return '';

  const trimmed = subpath.trim();
  if (!trimmed) return '';

  // Already an absolute external or cloud storage URL (e.g. S3, Cloudinary, YouTube)
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  // Ensure leading slash
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // 1. Configured & Validated Public Storage Host or Backend Base URL
  const publicBase = (
    process.env.STORAGE_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.PUBLIC_URL ||
    ''
  ).trim();

  if (publicBase) {
    try {
      const parsed = new URL(publicBase);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const cleanBase = parsed.origin + parsed.pathname.replace(/\/$/, '');
        return `${cleanBase}${normalizedPath}`;
      }
    } catch {
      logger.warn(`[Storage] Invalid public base URL configured in environment: "${publicBase}". Falling back to safe relative path.`);
    }
  }

  // 2. Safe Fallback to relative path
  // NOTE: We deliberately do NOT inspect arbitrary incoming request Host headers (e.g. req.get('host'))
  // to prevent Host Header Injection, SSRF, or poisoned URLs from being persisted into database records.
  // In local development or same-origin setups, returning the relative path is safe and sufficient.
  return normalizedPath;
}

// 4. Storage Diagnostics
export function getStorageDiagnostics() {
  const rootDir = getUploadRootDir();
  const isCustom = Boolean(process.env.STORAGE_PATH || process.env.UPLOAD_DIR);
  let isWritable = false;

  try {
    const testFile = path.join(rootDir, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    isWritable = true;
  } catch (err) {
    isWritable = false;
  }

  return {
    rootDir,
    mode: isCustom ? 'persistent-mount' : 'local-ephemeral',
    isWritable,
    isCustomPath: isCustom,
  };
}
