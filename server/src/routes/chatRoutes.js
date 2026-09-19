import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  getMessages,
  postMessage,
  uploadChatFile,
  getContacts,
  getCommunityThreads,
  getUnreadCount,
  markAnnouncementsRead,
  getNotifications,
} from '../controllers/chatController.js';
import { authenticateToken } from '../middleware/auth.js';

const uploadDir = path.resolve('uploads', 'chat');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `chat-${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = express.Router();

router.use(authenticateToken);

router.get('/messages', getMessages);
router.post('/messages', postMessage);
router.post('/upload', upload.single('file'), uploadChatFile);
router.get('/contacts', getContacts);
router.get('/community/threads', getCommunityThreads);
router.get('/unread-count', getUnreadCount);
router.post('/read-announcements', markAnnouncementsRead);
router.get('/notifications', getNotifications);

export default router;
