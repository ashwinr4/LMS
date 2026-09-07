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
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const protect = authenticateToken;

// Ensure upload directory exists
const uploadDir = path.resolve('uploads/lessons');
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
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

const router = express.Router();

// Real lecture media file upload (videos, documents, PDFs)
router.post('/upload-media', protect, requireRoles('COURSE_CREATOR', 'ADMIN'), upload.single('file'), uploadLessonMedia);

// Enrolled courses for authenticated user (must be before /:id)
router.get('/my-courses', protect, getMyAssignments);

// Public Routes — Course Catalog
router.get('/', listModules);
router.get('/:id', getModule);

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
