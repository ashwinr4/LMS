import express from 'express';
import {
  listModeratorUsers,
  getUserDetail,
  listModeratorCourses,
  listAuditLogs,
} from '../controllers/adminController.js';
import {
  getAdminQueue,
  approveEnrollment,
  rejectEnrollment,
} from '../controllers/enrollmentController.js';
import { authenticateToken, requireModeratorPermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// 1. Users Module (View)
router.get('/users', requireModeratorPermission('users', 'view'), listModeratorUsers);
router.get('/users/:id', requireModeratorPermission('users', 'view'), getUserDetail);

// 2. Courses Module (View)
router.get('/courses', requireModeratorPermission('courses', 'view'), listModeratorCourses);

// 3. Enrollments Module (View & Approve)
router.get('/enrollments', requireModeratorPermission('enrollments', 'view'), getAdminQueue);
router.patch('/enrollments/:id/approve', requireModeratorPermission('enrollments', 'approve'), approveEnrollment);
router.patch('/enrollments/:id/reject', requireModeratorPermission('enrollments', 'approve'), rejectEnrollment);

// 4. Audit Logs Module (View)
router.get('/audit-logs', requireModeratorPermission('auditLogs', 'view'), listAuditLogs);

export default router;
