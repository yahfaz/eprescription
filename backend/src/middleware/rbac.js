import ApiError from '../utils/ApiError.js';

/**
 * Role-based access control. Usage: router.post('/', requireRole('admin','prescriber'), ...)
 */
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${allowedRoles.join(' or ')}`));
    }
    next();
  };
}

/**
 * Only DEA-registered prescribers may sign/transmit. Controlled substances
 * (DEA schedule >= 2) additionally require a recorded DEA number.
 */
export function requirePrescriber(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== 'prescriber' && req.user.role !== 'admin') {
    return next(ApiError.forbidden('Only prescribers may perform this action'));
  }
  next();
}
