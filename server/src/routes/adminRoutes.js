import express from 'express';
import multer from 'multer';
import {
  listUsers,
  getUserDetail,
  updateUserDetail,
  createUser,
  updateUserStatus,
  updateUserRole,
  resetUserPassword,
  updateModeratorPermissions,
  getModeratorPermissionHistory,
  bulkImportUsers,
  listAllCourses,
  updateCourseStatus,
  runExpirationSweep,
  listAuditLogs,
  getDashboardSummary,
  getAdminBadgeCounts,
} from '../controllers/adminController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// All Admin routes require ADMIN role
router.use(authenticateToken);
router.use(requireRoles('ADMIN'));

// ── Dashboard Overview & Live Metrics ──
router.get('/dashboard-summary', getDashboardSummary);
router.get('/badge-counts', getAdminBadgeCounts);

// ── User Management ──
router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUserDetail);
router.put('/users/:id', updateUserDetail);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/role', updateUserRole);
router.post('/users/:id/reset-password', resetUserPassword);
router.put('/users/:id/moderator-permissions', updateModeratorPermissions);
router.get('/users/:id/moderator-permissions/history', getModeratorPermissionHistory);
router.post('/users/bulk-import', upload.single('file'), bulkImportUsers);

// ── Course Lifecycle & Expiration ──
router.get('/courses', listAllCourses);
router.patch('/courses/:id/status', updateCourseStatus);
router.post('/courses/check-expirations', runExpirationSweep);

import {
  getDatabaseSettings,
  testDatabaseConnection,
  updateDatabaseSettings,
} from '../controllers/adminSettingsController.js';

// ── Security Audit Logs Hub ──
router.get('/audit-logs', listAuditLogs);

// ── Platform & Database Settings (Strictly ADMIN Only) ──
router.get('/settings/database', getDatabaseSettings);
router.post('/settings/database/test', testDatabaseConnection);
router.put('/settings/database', updateDatabaseSettings);

export default router;
