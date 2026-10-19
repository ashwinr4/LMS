import { logger } from './logger.js';

export const FORBIDDEN_FALLBACKS = [
  'esmms_super_secure_access_token_secret_key_2026_x89',
  'esmms_super_secure_refresh_token_secret_key_2026_y90',
  'your_jwt_access_secret_key_min_32_bytes',
  'your_jwt_refresh_secret_key_min_32_bytes',
];

/**
 * Validates environment configuration for production safety and startup integrity.
 * @param {object} [env=process.env] - Environment dictionary to evaluate
 * @param {object} [options={}] - Execution options: { exitOnError: boolean, silent: boolean }
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateEnvironmentConfig(env = process.env, options = {}) {
  const exitOnError = options.exitOnError ?? true;
  const silent = options.silent ?? false;
  const isProd = env.NODE_ENV === 'production';

  const errors = [];
  const warnings = [];

  const accessSecret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  const refreshSecret = env.JWT_REFRESH_SECRET || env.REFRESH_TOKEN_SECRET;

  // 1. Mandatory JWT Secrets
  if (!accessSecret || !refreshSecret) {
    errors.push('CRITICAL CONFIGURATION ERROR: Both JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (or legacy JWT_SECRET and REFRESH_TOKEN_SECRET) must be set in environment variables.');
  } else {
    // 2. Cryptographic Entropy & Minimum Length
    if (accessSecret.length < 32 || refreshSecret.length < 32) {
      errors.push('CRITICAL CONFIGURATION ERROR: JWT secrets must be at least 32 characters in length for cryptographic security.');
    }
    // 3. Known Insecure Static Fallbacks
    if (FORBIDDEN_FALLBACKS.includes(accessSecret) || FORBIDDEN_FALLBACKS.includes(refreshSecret)) {
      errors.push('CRITICAL CONFIGURATION ERROR: Known static/default fallback JWT secret detected in environment.');
    }
  }

  // 4. Production Database Connection String Requirement
  if (isProd && !env.DATABASE_URL && !env.POSTGRES_URL && !env.MONGODB_URL && !env.POSTGRES_PRISMA_URL) {
    errors.push('CRITICAL CONFIGURATION ERROR: Production database connection string (DATABASE_URL / POSTGRES_URL / MONGODB_URL) must be set in environment variables.');
  }

  // 5. Production Client URL Notice
  if (isProd && (!env.CLIENT_URL || env.CLIENT_URL.includes('localhost'))) {
    warnings.push('PRODUCTION NOTICE: CLIENT_URL is not set to a production domain (currently localhost or unset). Verify CORS and cookie settings.');
  }

  // 6. Persistent Storage Diagnostics Notice
  const storagePath = env.STORAGE_PATH || env.UPLOAD_DIR;
  if (isProd && !storagePath) {
    warnings.push('PRODUCTION STORAGE NOTICE: Neither STORAGE_PATH nor UPLOAD_DIR is configured. Uploaded media is using ephemeral container storage and will not persist across redeployments. Mount a persistent disk volume for production media retention.');
  }

  // Handle Errors
  if (errors.length > 0) {
    if (!silent) {
      errors.forEach((err) => logger.error(err));
    }
    if (exitOnError && (isProd || !env.ALLOW_INSECURE_SECRETS)) {
      logger.error('Startup aborted due to environment validation failure.');
      process.exit(1);
    }
    return { valid: false, errors, warnings };
  }

  // Handle Warnings
  if (warnings.length > 0 && !silent) {
    warnings.forEach((warn) => logger.warn(warn));
  }

  if (!silent) {
    logger.info('Environment configuration and security entropy validated successfully.');
  }

  return { valid: true, errors: [], warnings };
}
