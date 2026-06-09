import { Router } from 'express';
import authRoutes from './auth.routes.js';
import patientRoutes from './patients.routes.js';
import prescriptionRoutes from './prescriptions.routes.js';
import medicationRoutes from './medications.routes.js';
import pharmacyRoutes from './pharmacies.routes.js';
import userRoutes from './users.routes.js';
import { activeNetwork } from '../services/pharmacy.service.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', pharmacyNetwork: activeNetwork, time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/medications', medicationRoutes);
router.use('/pharmacies', pharmacyRoutes);
router.use('/users', userRoutes);

export default router;
