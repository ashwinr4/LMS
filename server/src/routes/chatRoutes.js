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
const storage = multer.memoryStorage();

const ALLOWED_CHAT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.txt', '.csv', '.xlsx',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.zip',
];

const chatFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const dangerous = ['.html', '.htm', '.svg', '.xml', '.js', '.jsx', '.ts', '.tsx', '.php', '.exe', '.sh', '.bat', '.cmd', '.vbs', '.py'];
  if (dangerous.includes(ext) || !ALLOWED_CHAT_EXTENSIONS.includes(ext)) {
    return cb(new Error('INVALID_FILE_TYPE: Only documents and images are permitted for chat attachments.'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: chatFileFilter,
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
