import express from 'express';
import {
  listModeratorUsers,
  listModeratorCourses,
} from '../controllers/adminController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// Moderator & Admin access
router.use(authenticateToken);
router.use(requireRoles('MODERATOR', 'ADMIN'));

router.get('/users', listModeratorUsers);
router.get('/courses', listModeratorCourses);

export default router;
