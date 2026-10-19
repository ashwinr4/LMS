import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  listModules,
  getModule,
  createModule,
  updateModule,
  deleteModule,
  createSection,
  updateSection,
  deleteSection,
  createLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
  getModuleProgress,
  getMyAssignments,
  uploadLessonMedia,
} from '../controllers/moduleController.js';
import { authenticateToken, optionalAuthenticateToken, requireRoles } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';
import { getUploadDir } from '../utils/storage.js';

const protect = authenticateToken;

// Ensure upload directory exists via storage abstraction
const uploadDir = getUploadDir('lessons');

const ALLOWED_MEDIA_EXTENSIONS = [
  '.mp4', '.webm', '.ogg', '.mov', '.mkv',
  '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
];

const mediaFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const dangerous = ['.html', '.htm', '.svg', '.xml', '.js', '.jsx', '.ts', '.tsx', '.php', '.exe', '.sh', '.bat', '.cmd', '.vbs', '.py'];
  if (dangerous.includes(ext) || !ALLOWED_MEDIA_EXTENSIONS.includes(ext)) {
    return cb(new Error('INVALID_FILE_TYPE: File extension is not permitted for course resources.'));
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: mediaFileFilter,
});

const router = express.Router();

// Auto-validate identifier parameters in nanoseconds
router.param('id', (req, res, next) => validateId('id')(req, res, next));
router.param('sectionId', (req, res, next) => validateId('sectionId')(req, res, next));
router.param('lessonId', (req, res, next) => validateId('lessonId')(req, res, next));

// Real lecture media file upload (videos, documents, PDFs)
router.post('/upload-media', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), upload.single('file'), uploadLessonMedia);

// Enrolled courses for authenticated user (must be before /:id)
router.get('/my-courses', protect, getMyAssignments);

// Public Routes — Course Catalog (with optional auth for permission filtering)
router.get('/', optionalAuthenticateToken, listModules);
router.get('/:id', optionalAuthenticateToken, getModule);

// Authenticated Student Routes
router.get('/:id/progress', protect, getModuleProgress);
router.post('/lessons/:lessonId/complete', protect, completeLesson);

// Creator / Admin Routes — Module CRUD
router.post('/', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), createModule);
router.put('/:id', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), updateModule);
router.delete('/:id', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), deleteModule);

// Section CRUD
router.post('/:id/sections', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), createSection);
router.put('/:id/sections/:sectionId', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), updateSection);
router.delete('/:id/sections/:sectionId', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), deleteSection);

// Lesson CRUD
router.post('/sections/:sectionId/lessons', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), createLesson);
router.put('/lessons/:lessonId', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), updateLesson);
router.delete('/lessons/:lessonId', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), deleteLesson);

export default router;
