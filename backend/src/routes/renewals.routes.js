import { Router } from 'express';
import * as ctrl from '../controllers/renewals.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listRenewals);
router.post('/', requireRole('admin', 'prescriber', 'nurse', 'staff'), ctrl.createRenewal);
router.post('/:id/respond', requireRole('admin', 'prescriber'), ctrl.respondRenewal);

export default router;
