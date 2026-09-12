import express from 'express';
import {
  register,
  login,
  googleLogin,
  refresh,
  logout,
  getMe,
  updateProfile,
  requestOtp,
  verifyOtp,
  requestPasswordReset,
  changePassword,
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Public Authentication Routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/request-password-reset', requestPasswordReset);

router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);

// Protected Authentication & Profile Routes
router.get('/me', authenticateToken, getMe);
router.get('/profile', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);
router.post('/change-password', authenticateToken, changePassword);

export default router;
