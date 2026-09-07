import express from 'express';
import {
  getMessages,
  postMessage,
  getContacts,
  getUnreadCount,
  markAnnouncementsRead,
  getNotifications,
} from '../controllers/chatController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/messages', getMessages);
router.post('/messages', postMessage);
router.get('/contacts', getContacts);
router.get('/unread-count', getUnreadCount);
router.post('/read-announcements', markAnnouncementsRead);
router.get('/notifications', getNotifications);

export default router;
