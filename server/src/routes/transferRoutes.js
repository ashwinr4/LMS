import express from 'express';
import {
  listTransfers,
  createTransfer,
  approveTransfer,
  rejectTransfer,
} from '../controllers/transferController.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// 1. List transfer requests (Staff can see all, learners can query their own)
router.get('/', listTransfers);

// 2. Submit a new transfer or SLA extension request
router.post('/', createTransfer);

// 3. Authorize / Approve a request (ADMIN or MODERATOR)
router.patch('/:id/approve', requireRoles('ADMIN', 'MODERATOR'), approveTransfer);

// 4. Reject a request (ADMIN or MODERATOR)
router.patch('/:id/reject', requireRoles('ADMIN', 'MODERATOR'), rejectTransfer);

export default router;
