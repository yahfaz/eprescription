import { Router } from 'express';
import * as ctrl from '../controllers/pharmacies.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createPharmacySchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listPharmacies);
router.post('/', requireRole('admin'), validate(createPharmacySchema), ctrl.createPharmacy);

export default router;
