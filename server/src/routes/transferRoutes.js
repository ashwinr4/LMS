import express from 'express';
import {
  listTransfers,
  createTransfer,
  approveTransfer,
  rejectTransfer,
} from '../controllers/transferController.js';
import { authenticateToken, requireRoles, requireModeratorPermission } from '../middleware/auth.js';
import { validateId } from '../middleware/validate.js';

const router = express.Router();
router.param('id', (req, res, next) => validateId('id')(req, res, next));

router.use(authenticateToken);

// 1. List transfer requests (Staff can see all, learners can query their own)
router.get('/', listTransfers);

// 2. Submit a new transfer or SLA extension request
router.post('/', createTransfer);

// 3. Authorize / Approve a request (ADMIN or MODERATOR with transfers.approve)
router.patch('/:id/approve', requireModeratorPermission('transfers', 'approve'), approveTransfer);

// 4. Reject a request (ADMIN or MODERATOR with transfers.approve)
router.patch('/:id/reject', requireModeratorPermission('transfers', 'approve'), rejectTransfer);

export default router;
