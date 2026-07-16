import { query } from '../db/pool.js';
import { verifyAccessToken } from '../utils/tokens.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import env from '../config/env.js';

/**
 * Authenticates a request from the `Authorization: Bearer <token>` header.
 * Loads the fresh user row so role/active/practice changes take effect
 * immediately rather than waiting for the access token to expire.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const { rows } = await query(
    `SELECT id, practice_id, email, first_name, last_name, role,
            npi, dea_number, email_verified, is_active, totp_enabled
       FROM users WHERE id = $1`,
    [payload.sub],
  );
  const user = rows[0];
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (!user.is_active) throw ApiError.forbidden('Account is deactivated');
  if (env.email.requireVerification && !user.email_verified) {
    throw ApiError.forbidden('Email address not verified');
  }

  req.user = user;
  next();
});
