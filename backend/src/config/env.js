import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return fallback;
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  database: {
    url: process.env.DATABASE_URL || null,
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'eprx',
    password: process.env.PGPASSWORD || 'eprx_password',
    database: process.env.PGDATABASE || 'eprescription',
    ssl: String(process.env.PGSSL).toLowerCase() === 'true',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me_change_me_32'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me_change_me_32'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    emailTokenSecret: required('EMAIL_TOKEN_SECRET', 'dev_email_secret_change_me_change_me_32'),
  },

  email: {
    transport: process.env.EMAIL_TRANSPORT || 'stream',
    from: process.env.EMAIL_FROM || 'ePrescribe <no-reply@eprescribe.local>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    appPublicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:5173',
    // When true, new registrations are marked email-verified immediately and no
    // verification email is required. Useful for initial setup / environments
    // without SMTP configured. Leave false in production.
    autoVerify: String(process.env.AUTO_VERIFY_EMAIL).toLowerCase() === 'true',
  },

  rxnorm: {
    baseUrl: process.env.RXNORM_BASE_URL || 'https://rxnav.nlm.nih.gov/REST',
  },

  pharmacy: {
    network: process.env.PHARMACY_NETWORK || 'internal',
    surescripts: {
      baseUrl: process.env.SURESCRIPTS_BASE_URL,
      accountId: process.env.SURESCRIPTS_ACCOUNT_ID,
      apiKey: process.env.SURESCRIPTS_API_KEY,
    },
  },
};

export default env;
