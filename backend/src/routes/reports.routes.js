import { Router } from 'express';
import * as ctrl from '../controllers/reports.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

router.get('/summary', requireRole('admin', 'prescriber'), ctrl.summary);

export default router;
