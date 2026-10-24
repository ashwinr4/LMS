import express from 'express';
import { streamMediaFile } from '../controllers/mediaController.js';

const router = express.Router();

// Stream or download protected media files (R2 + local fallback)
// Accepts :category ('lessons' | 'chat') and :filename
router.get('/:category/:filename', streamMediaFile);

export default router;
