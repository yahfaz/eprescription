import { Router } from 'express';
import * as ctrl from '../controllers/users.controller.js';
import * as audit from '../controllers/audit.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('admin'), ctrl.listUsers);
router.patch('/:id', requireRole('admin'), ctrl.updateUser);
router.get('/audit-logs', requireRole('admin'), audit.listAuditLogs);

export default router;
