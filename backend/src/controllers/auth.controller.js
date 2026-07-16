import { query, withTransaction } from '../db/pool.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { hashPassword, verifyPassword, generateOpaqueToken, sha256 } from '../utils/crypto.js';
import { signAccessToken } from '../utils/tokens.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { generateSecret, otpauthUri, verifyToken } from '../utils/totp.js';
import { recordAudit } from '../services/audit.service.js';
import { randomUUID } from 'node:crypto';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role,
    practiceId: u.practice_id,
    npi: u.npi,
    deaNumber: u.dea_number,
    emailVerified: u.email_verified,
    twoFactorEnabled: !!u.totp_enabled,
  };
}

/**
 * Base URL for email links (verification / password reset). An explicitly
 * configured APP_PUBLIC_URL always wins (useful when the frontend lives on a
 * different origin than the API). Otherwise we derive it from the incoming
 * request — with `trust proxy` enabled this reflects the real external
 * scheme/host behind Vercel or nginx, so links are never "localhost" in
 * production even if APP_PUBLIC_URL was forgotten.
 */
function publicBaseUrl(req) {
  if (process.env.APP_PUBLIC_URL) return process.env.APP_PUBLIC_URL.replace(/\/+$/, '');
  const host = req.get('host');
  if (host) return `${req.protocol}://${host}`;
  return env.email.appPublicUrl;
}

async function issueVerificationEmail(user, req) {
  const raw = generateOpaqueToken();
  await query(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'verify_email', $2, $3)`,
    [user.id, sha256(raw), new Date(Date.now() + VERIFY_TTL_MS)],
  );
  const link = `${publicBaseUrl(req)}/verify-email?token=${raw}`;
  await sendVerificationEmail(user.email, user.first_name, link);
}

async function issueRefreshToken(user, req) {
  // Opaque, single-use, rotating refresh token. Only its sha256 hash is stored.
  const jti = randomUUID();
  const raw = generateOpaqueToken();
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [jti, user.id, sha256(raw), new Date(Date.now() + REFRESH_TTL_MS), req.get('user-agent') || null, req.ip],
  );
  return raw;
}

// ── POST /auth/register ──────────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, role, practiceName, practiceId, npi, deaNumber, stateLicense, phone } =
    req.body;

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) throw ApiError.conflict('An account with this email already exists');

  const user = await withTransaction(async (client) => {
    let resolvedPracticeId = practiceId || null;
    if (!resolvedPracticeId && practiceName) {
      const { rows } = await client.query(
        'INSERT INTO practices (name) VALUES ($1) RETURNING id',
        [practiceName],
      );
      resolvedPracticeId = rows[0].id;
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await client.query(
      `INSERT INTO users
         (practice_id, email, password_hash, first_name, last_name, role, npi, dea_number, state_license, phone, email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [resolvedPracticeId, email, passwordHash, firstName, lastName, role, npi || null, deaNumber || null, stateLicense || null, phone || null, !env.email.requireVerification],
    );
    return rows[0];
  });

  // Only send a verification email when verification is actually enforced
  // (SMTP configured and auto-verify off); otherwise the account is usable now.
  if (env.email.requireVerification) {
    await issueVerificationEmail(user, req);
  }
  await recordAudit({
    userId: user.id,
    practiceId: user.practice_id,
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({
    message: env.email.requireVerification
      ? 'Account created. Check your email to verify your address before logging in.'
      : 'Account created. You can now log in.',
    user: publicUser(user),
  });
});

// ── POST /auth/verify-email ───────────────────────────────────────────────────
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const { rows } = await query(
    `SELECT * FROM email_tokens
      WHERE token_hash = $1 AND purpose = 'verify_email'`,
    [sha256(token)],
  );
  const record = rows[0];
  if (!record || record.consumed_at || new Date(record.expires_at) < new Date()) {
    throw ApiError.badRequest('Verification link is invalid or has expired');
  }

  await withTransaction(async (client) => {
    await client.query('UPDATE email_tokens SET consumed_at = now() WHERE id = $1', [record.id]);
    await client.query('UPDATE users SET email_verified = true WHERE id = $1', [record.user_id]);
  });

  await recordAudit({ userId: record.user_id, action: 'auth.verify_email', entityType: 'user', entityId: record.user_id });
  res.json({ message: 'Email verified. You can now log in.' });
});

// ── POST /auth/resend-verification ───────────────────────────────────────────
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Always respond the same way to avoid leaking which emails exist
  if (user && !user.email_verified) {
    await issueVerificationEmail(user, req);
  }
  res.json({ message: 'If an unverified account exists for that email, a new verification link has been sent.' });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.is_active) throw ApiError.forbidden('Account is deactivated');
  if (env.email.requireVerification && !user.email_verified) {
    throw ApiError.forbidden('Please verify your email address before logging in');
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user, req);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  await recordAudit({
    userId: user.id,
    practiceId: user.practice_id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ user: publicUser(user), accessToken, refreshToken });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────
export const refresh = asyncHandler(async (req, res) => {
  const raw = req.body?.refreshToken;
  if (!raw) throw ApiError.unauthorized('Missing refresh token');

  const { rows } = await query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [sha256(raw)]);
  const record = rows[0];
  if (!record || record.revoked_at || new Date(record.expires_at) < new Date()) {
    throw ApiError.unauthorized('Refresh token is invalid or expired');
  }

  const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [record.user_id]);
  const user = userRows[0];
  if (!user || !user.is_active) throw ApiError.unauthorized('User unavailable');

  // Rotate: revoke the old token and issue a new one
  const newRaw = await withTransaction(async (client) => {
    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [record.id]);
    const jti = randomUUID();
    const token = generateOpaqueToken();
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [jti, user.id, sha256(token), new Date(Date.now() + REFRESH_TTL_MS), req.get('user-agent') || null, req.ip],
    );
    return token;
  });

  res.json({ accessToken: signAccessToken(user), refreshToken: newRaw });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  const raw = req.body?.refreshToken;
  if (raw) {
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(raw)]);
  }
  res.json({ message: 'Logged out' });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (user) {
    const raw = generateOpaqueToken();
    await query(
      `INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'password_reset', $2, $3)`,
      [user.id, sha256(raw), new Date(Date.now() + RESET_TTL_MS)],
    );
    const link = `${publicBaseUrl(req)}/reset-password?token=${raw}`;
    await sendPasswordResetEmail(user.email, user.first_name, link);
  }
  res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const { rows } = await query(
    `SELECT * FROM email_tokens WHERE token_hash = $1 AND purpose = 'password_reset'`,
    [sha256(token)],
  );
  const record = rows[0];
  if (!record || record.consumed_at || new Date(record.expires_at) < new Date()) {
    throw ApiError.badRequest('Password reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(password);
  await withTransaction(async (client) => {
    await client.query('UPDATE email_tokens SET consumed_at = now() WHERE id = $1', [record.id]);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    // Invalidate all sessions on password change
    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
      record.user_id,
    ]);
  });

  await recordAudit({ userId: record.user_id, action: 'auth.reset_password', entityType: 'user', entityId: record.user_id });
  res.json({ message: 'Password updated. You can now log in with your new password.' });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ── Two-factor (TOTP) enrollment — EPCS-style controlled-substance signing ────
// POST /auth/2fa/setup → generate a secret and return the otpauth URI to scan
export const setupTwoFactor = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT totp_enabled FROM users WHERE id = $1', [req.user.id]);
  if (rows[0]?.totp_enabled) throw ApiError.conflict('Two-factor authentication is already enabled');

  const secret = generateSecret();
  await query('UPDATE users SET totp_secret = $2 WHERE id = $1', [req.user.id, secret]);
  res.json({
    secret,
    otpauthUri: otpauthUri(secret, { account: req.user.email }),
    message: 'Add this secret to an authenticator app, then confirm a code to enable.',
  });
});

// POST /auth/2fa/enable { token } → verify a code and turn 2FA on
export const enableTwoFactor = asyncHandler(async (req, res) => {
  const token = req.body?.token;
  const { rows } = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
  const secret = rows[0]?.totp_secret;
  if (!secret) throw ApiError.badRequest('Start setup first (POST /auth/2fa/setup)');
  if (!verifyToken(secret, token)) throw ApiError.badRequest('Invalid authentication code');

  await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);
  await recordAudit({ userId: req.user.id, action: 'auth.2fa.enable', entityType: 'user', entityId: req.user.id });
  res.json({ message: 'Two-factor authentication enabled.' });
});

// POST /auth/2fa/disable { token } → verify a code and turn 2FA off
export const disableTwoFactor = asyncHandler(async (req, res) => {
  const token = req.body?.token;
  const { rows } = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.totp_enabled) throw ApiError.badRequest('Two-factor authentication is not enabled');
  if (!verifyToken(rows[0].totp_secret, token)) throw ApiError.badRequest('Invalid authentication code');

  await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user.id]);
  await recordAudit({ userId: req.user.id, action: 'auth.2fa.disable', entityType: 'user', entityId: req.user.id });
  res.json({ message: 'Two-factor authentication disabled.' });
});
