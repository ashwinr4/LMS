import express from 'express';
import {
  requestEnrollment,
  forwardToAdmin,
  approveEnrollment,
  rejectEnrollment,
  getCreatorQueue,
  getCreatorQueueCount,
  getAdminQueue,
  getModuleEnrollmentStatus,
  getMyRequests,
} from '../controllers/enrollmentController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const protect = authenticateToken;

const router = express.Router();

// Student Routes
router.post('/request', protect, requestEnrollment);
router.get('/my-requests', protect, getMyRequests);
router.get('/status/:moduleId', protect, getModuleEnrollmentStatus);

// Creator Queue & Endorsement
router.get('/creator-queue', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), getCreatorQueue);
router.get('/creator-queue-count', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), getCreatorQueueCount);
router.patch('/:id/forward', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), forwardToAdmin);

// Admin Approvals Hub
router.get('/admin-queue', protect, requireRoles('ADMIN'), getAdminQueue);
router.patch('/:id/approve', protect, requireRoles('ADMIN'), approveEnrollment);

// Rejection (Creator or Admin)
router.patch('/:id/reject', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), rejectEnrollment);

export default router;
