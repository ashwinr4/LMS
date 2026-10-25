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

  // 7. Email Service Configuration Validation & Deliverability Diagnostics
  const brevoApiKey = env.BREVO_API_KEY || (env.SMTP_PASS && env.SMTP_PASS.startsWith('xkeysib-') ? env.SMTP_PASS : null);
  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;
  const smtpHost = env.SMTP_HOST || 'smtp-relay.brevo.com';
  const smtpPort = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587;
  const smtpFrom = env.SMTP_FROM;

  if (isProd) {
    if (!brevoApiKey && (!smtpUser || !smtpPass)) {
      warnings.push('PRODUCTION EMAIL NOTICE: Neither BREVO_API_KEY nor SMTP credentials (SMTP_USER / SMTP_PASS) are configured in environment variables. Live email delivery (OTP passcodes, account provisioning, password recovery) will be disabled.');
    } else if (!brevoApiKey && smtpPort === 587) {
      warnings.push('RENDER PORT RESTRICTION NOTICE: Render Free Tier strictly blocks outbound traffic on SMTP ports 25, 465, and 587. If your service is on Render Free Tier, provide BREVO_API_KEY (operates over Port 443 HTTPS) or change SMTP_PORT to 2525.');
    }
  }

  if (smtpUser && smtpPass && !brevoApiKey) {
    if (isNaN(smtpPort) || ![25, 465, 587, 2525].includes(smtpPort)) {
      warnings.push(`SMTP CONFIGURATION WARNING: SMTP_PORT (${env.SMTP_PORT}) is unusual. Expected standard SMTP ports are 587 (STARTTLS), 465 (SSL), or 2525 (Alternative).`);
    }

    if (smtpHost.includes('brevo.com') || smtpHost.includes('sendinblue.com')) {
      if (smtpFrom && smtpFrom.includes('@smtp-brevo.com')) {
        warnings.push('SMTP CONFIGURATION ERROR: SMTP_FROM appears to be set to a technical Brevo SMTP username (@smtp-brevo.com). Brevo requires a verified sender email address in SMTP_FROM, not the login identifier.');
      }

      if (smtpFrom) {
        const fromEmailMatch = smtpFrom.match(/<([^>]+)>/) || [null, smtpFrom.trim()];
        const fromEmail = fromEmailMatch[1] || '';
        const domain = fromEmail.split('@')[1]?.toLowerCase();
        const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];

        if (domain && freeDomains.includes(domain)) {
          warnings.push(`SMTP DELIVERABILITY WARNING: SMTP_FROM uses a free webmail domain (@${domain}) with Brevo relay. Brevo requires this address to be explicitly verified in the Brevo Senders console (app.brevo.com/senders). Furthermore, major receiving inboxes may reject or spam emails due to DMARC/SPF misalignment. For reliable production delivery, an authenticated custom domain is strongly recommended.`);
        }
      } else {
        warnings.push('SMTP CONFIGURATION WARNING: SMTP_FROM is not explicitly configured. Messages will fall back to default, which Brevo may reject. Set SMTP_FROM to an authorized, verified sender address in your Brevo account.');
      }
    }
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
