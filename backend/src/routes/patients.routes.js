import { Router } from 'express';
import * as ctrl from '../controllers/patients.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createPatientSchema, updatePatientSchema, createAllergySchema } from '../validators/schemas.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listPatients);
router.get('/:id', ctrl.getPatient);
router.get('/:id/medication-history', ctrl.medicationHistory);
router.post('/', requireRole('admin', 'prescriber', 'nurse', 'staff'), validate(createPatientSchema), ctrl.createPatient);
router.patch('/:id', requireRole('admin', 'prescriber', 'nurse', 'staff'), validate(updatePatientSchema), ctrl.updatePatient);
router.delete('/:id', requireRole('admin', 'prescriber'), ctrl.deactivatePatient);

router.post('/:id/allergies', requireRole('admin', 'prescriber', 'nurse', 'staff'), validate(createAllergySchema), ctrl.addAllergy);
router.delete('/:id/allergies/:allergyId', requireRole('admin', 'prescriber', 'nurse'), ctrl.removeAllergy);

export default router;
