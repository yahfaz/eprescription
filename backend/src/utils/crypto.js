import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Generate a cryptographically random, URL-safe opaque token. */
export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Deterministic hash for storing tokens at rest (never store raw tokens). */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
