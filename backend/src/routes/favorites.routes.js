import { Router } from 'express';
import * as ctrl from '../controllers/favorites.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.listFavorites);
router.post('/', ctrl.createFavorite);
router.delete('/:id', ctrl.deleteFavorite);

export default router;
