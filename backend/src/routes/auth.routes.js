import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema,
  resetPasswordSchema, resendVerificationSchema,
} from '../validators/schemas.js';

const router = Router();

// Tighter rate limit on authentication endpoints to slow brute-force attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/verify-email', validate(verifyEmailSchema), ctrl.verifyEmail);
router.post('/resend-verification', authLimiter, validate(resendVerificationSchema), ctrl.resendVerification);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), ctrl.resetPassword);
router.get('/me', authenticate, ctrl.me);

export default router;
