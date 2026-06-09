import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      practiceId: user.practice_id || null,
      email: user.email,
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

export function signRefreshToken(user, jti) {
  return jwt.sign({ sub: user.id, jti }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}
