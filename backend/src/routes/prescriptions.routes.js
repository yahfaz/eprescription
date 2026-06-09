import { Router } from 'express';
import * as ctrl from '../controllers/prescriptions.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import {
  createPrescriptionSchema, updatePrescriptionSchema,
  signPrescriptionSchema, cancelPrescriptionSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listPrescriptions);
router.get('/:id', ctrl.getPrescription);
router.get('/:id/safety-check', ctrl.previewSafetyChecks);

router.post('/', requireRole('admin', 'prescriber', 'nurse', 'staff'), validate(createPrescriptionSchema), ctrl.createPrescription);
router.patch('/:id', requireRole('admin', 'prescriber', 'nurse', 'staff'), validate(updatePrescriptionSchema), ctrl.updatePrescription);

// Signing/transmitting/cancelling are restricted to prescribers (or admins)
router.post('/:id/sign', requireRole('admin', 'prescriber'), validate(signPrescriptionSchema), ctrl.signPrescription);
router.post('/:id/transmit', requireRole('admin', 'prescriber'), ctrl.transmitPrescriptionHandler);
router.post('/:id/cancel', requireRole('admin', 'prescriber'), validate(cancelPrescriptionSchema), ctrl.cancelPrescriptionHandler);

export default router;
