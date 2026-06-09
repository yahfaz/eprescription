import { Router } from 'express';
import * as ctrl from '../controllers/medications.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.get('/search', ctrl.search);
router.post('/resolve', ctrl.resolve);

export default router;
