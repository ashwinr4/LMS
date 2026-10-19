import { logger } from './logger.js';

/**
 * Security Headers, CORS, and Content Security Policy (CSP) Abstraction
 * Enforces explicit domain allowances and prevents arbitrary cross-origin access with credentials.
 */

// 1. Build Canonical Allowed Origins List
export function getAllowedOrigins() {
  const isProd = process.env.NODE_ENV === 'production';
  const origins = new Set();

  // Primary Client URL
  const rawClientUrl = process.env.CLIENT_URL || (isProd ? null : 'http://localhost:5173');
  if (rawClientUrl && typeof rawClientUrl === 'string' && rawClientUrl.trim()) {
    origins.add(rawClientUrl.trim().replace(/\/$/, ''));
  }

  // Additional explicitly configured domains (e.g. custom domain, admin portal, staging)
  const additionalOrigins = process.env.ADDITIONAL_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS;
  if (additionalOrigins && typeof additionalOrigins === 'string') {
    additionalOrigins
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  // Localhost allowances strictly limited to non-production environments
  if (!isProd || process.env.ALLOW_LOCALHOST_IN_PROD === 'true') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5174');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://127.0.0.1:5174');
  }

  return Array.from(origins);
}

// 2. Strict Origin Validation Function
export function isOriginAllowed(origin) {
  // Allow requests without Origin header (e.g., same-origin, curl, server-to-server, native apps)
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/$/, '');
  const allowed = getAllowedOrigins();

  // Exact match against explicitly configured origins
  if (allowed.includes(cleanOrigin) || allowed.includes(origin)) {
    return true;
  }

  // Strictly reject arbitrary wildcard matches (*.onrender.com or *.vercel.app)
  // Cross-origin credentialed requests must only come from verified, operator-configured domains
  return false;
}

// 3. Dynamic Content Security Policy (CSP) Directives Builder
export function buildContentSecurityPolicyDirectives() {
  const allowedOrigins = getAllowedOrigins();
  const isProd = process.env.NODE_ENV === 'production';

  // Format WebSocket origins from allowed HTTP origins
  const wsOrigins = allowedOrigins
    .map((o) => {
      try {
        const url = new URL(o);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}`;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // External services required for functionality
  const connectSrc = [
    "'self'",
    ...allowedOrigins,
    ...wsOrigins,
    'https://accounts.google.com',
  ];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'", // Required for React runtime and Vite dynamic chunks
    'https://accounts.google.com/gsi/client',
  ];

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
  ];

  const fontSrc = [
    "'self'",
    'https://fonts.gstatic.com',
    'data:',
  ];

  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    'https:',
    ...allowedOrigins,
  ];

  const mediaSrc = [
    "'self'",
    'blob:',
    'data:',
    'https:',
    ...allowedOrigins,
  ];

  const frameSrc = [
    "'self'",
    'https://accounts.google.com',
    'https://www.youtube.com',
    'https://youtube.com',
    'blob:',
    'data:',
  ];

  return {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc,
    fontSrc,
    imgSrc,
    mediaSrc,
    connectSrc,
    frameSrc,
    workerSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
  };
}

// 4. Serialize CSP Directives for Headers
export function getSerializedContentSecurityPolicy() {
  const directives = buildContentSecurityPolicyDirectives();
  return Object.entries(directives)
    .map(([key, sources]) => {
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${kebabKey} ${sources.join(' ')}`;
    })
    .join('; ');
}
