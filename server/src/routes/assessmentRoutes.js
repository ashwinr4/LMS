import express from 'express';
import multer from 'multer';
import {
  listAssessments,
  getAssessment,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getMyExams,
  startExam,
  submitExam,
  exitExam,
  extractQuestionsFromDocument,
} from '../controllers/assessmentController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ── Question Extraction Route with Security Scan ──
router.post(
  '/extract',
  authenticateToken,
  requireRoles('COURSE_CREATOR', 'ADMIN'),
  upload.single('file'),
  extractQuestionsFromDocument
);

// ── Student Exam Routes ──
router.get('/my-exams', authenticateToken, getMyExams);
router.get('/:id/start', authenticateToken, startExam);
router.post('/:id/submit', authenticateToken, submitExam);
router.post('/:id/exit', authenticateToken, exitExam);

// ── Creator & Admin Question Bank Routes ──
router.get('/', authenticateToken, requireRoles('COURSE_CREATOR', 'ADMIN'), listAssessments);
router.get('/:id', authenticateToken, requireRoles('COURSE_CREATOR', 'ADMIN'), getAssessment);
router.post('/', authenticateToken, requireRoles('COURSE_CREATOR', 'ADMIN'), createAssessment);
router.put('/:id', authenticateToken, requireRoles('COURSE_CREATOR', 'ADMIN'), updateAssessment);
router.delete('/:id', authenticateToken, requireRoles('COURSE_CREATOR', 'ADMIN'), deleteAssessment);

export default router;
