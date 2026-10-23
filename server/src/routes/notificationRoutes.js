import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  markAsReadByLink,
  markAsReadByRequest,
} from '../controllers/notificationController.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getNotifications);
router.patch('/read-all', markAllAsRead);
router.patch('/read-by-link', markAsReadByLink);
router.patch('/read-by-request', markAsReadByRequest);

router.param('id', (req, res, next) => validateId('id')(req, res, next));
router.patch('/:id/read', markAsRead);

export default router;

