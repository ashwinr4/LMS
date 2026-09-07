import express from 'express';
import { verifyCertificate } from '../controllers/certificateController.js';
import { getMyCertificates } from '../controllers/assessmentController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public Verification Endpoint
router.get('/verify/:code', verifyCertificate);

// Student Authenticated Endpoint
router.get('/my-certificates', authenticateToken, getMyCertificates);

export default router;
