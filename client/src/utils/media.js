import { secureStorage, STORAGE_KEYS } from './secureStorage.js';

/**
 * Resolves media and file attachment URLs to the correct backend or CDN host
 * when frontend and backend are deployed across different domains.
 *
 * @param {string} url - Input media URL or relative upload path
 * @param {string} [customBase] - Optional base URL override (used in tests or custom storage)
 * @returns {string} Fully resolved media URL or safe relative path
 */
export function resolveMediaUrl(url, customBase = null) {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  // If already absolute or blob / data URL
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  // Handle previous simulated placeholder URLs from older test fixtures
  if (trimmed.includes('storage.qualiva.io/videos/')) {
    return '/uploads/lessons/sample-video.mp4';
  }
  if (trimmed.includes('storage.qualiva.io/documents/')) {
    return '/uploads/lessons/sample-doc.pdf';
  }

  // Normalize relative path
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // Helper to safely attach user token to internal /uploads/ or /media/ paths
  const appendAuthToken = (resolved) => {
    try {
      const token = secureStorage?.getItem(STORAGE_KEYS.TOKEN);
      if (token && (resolved.includes('/uploads/') || resolved.includes('/media/')) && !resolved.includes('token=')) {
        const separator = resolved.includes('?') ? '&' : '?';
        return `${resolved}${separator}token=${encodeURIComponent(token)}`;
      }
    } catch {
      // In non-browser / test environments
    }
    return resolved;
  };

  // Read environment variable safely across both Vite and Node test environments
  let apiBase = '';
  if (customBase && typeof customBase === 'string') {
    apiBase = customBase.trim();
  } else {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        apiBase = import.meta.env.VITE_STORAGE_URL || import.meta.env.VITE_API_URL || '';
      }
    } catch {
      // Ignore
    }
    if (!apiBase && typeof process !== 'undefined' && process.env) {
      apiBase = process.env.VITE_STORAGE_URL || process.env.VITE_API_URL || '';
    }
  }

  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // Strip trailing /api/v1 or trailing slash to get origin + base path
        const basePath = parsed.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
        const origin = parsed.origin + basePath;
        return appendAuthToken(`${origin}${normalizedPath}`);
      }
    } catch {
      // If apiBase is an invalid URL, do not construct corrupt URL; fall back safely
    }
  }

  return appendAuthToken(normalizedPath);
}
