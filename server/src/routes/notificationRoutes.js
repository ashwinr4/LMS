import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notificationController.js';

const router = Router();
router.param('id', (req, res, next) => validateId('id')(req, res, next));

router.use(authenticateToken);

router.get('/', getNotifications);
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);

export default router;
