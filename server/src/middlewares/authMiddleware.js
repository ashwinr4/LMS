// Compatibility shim to prevent any future import path mismatch errors
export * from '../middleware/auth.js';
export { authenticateToken as requireAuth } from '../middleware/auth.js';
