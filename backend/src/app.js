import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import env from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();

// Behind a reverse proxy (nginx, Heroku, etc.) so req.ip is accurate
app.set('trust proxy', 1);

app.use(helmet());

// Decide whether a given request Origin is allowed. Same-origin requests
// (frontend + API served from one host, e.g. behind Vercel's /_/backend route
// prefix or nginx) are always allowed; CORS_ORIGINS adds explicit cross-origin
// frontends (e.g. a separate EMR), and "*" allows any origin.
function isAllowedOrigin(req, origin) {
  if (!origin) return true; // non-browser clients / same-origin without Origin
  if (env.corsOrigins.includes('*')) return true;
  if (env.corsOrigins.includes(origin)) return true;
  try {
    const reqHost = req.get('host');
    if (reqHost && new URL(origin).host === reqHost) return true; // same-origin
  } catch {
    /* malformed Origin header */
  }
  return false;
}

app.use(
  cors((req, callback) => {
    const origin = req.get('origin');
    // origin:true reflects the caller's Origin (required when credentials:true);
    // origin:false simply omits CORS headers so the browser blocks it — no 500.
    callback(null, { origin: isAllowedOrigin(req, origin), credentials: true });
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));

// Global, lenient rate limit (auth routes have a stricter one of their own)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Mount the API under both the bare prefix and the platform service prefix
// ("/_/backend"). This makes the backend reachable whether the hosting platform
// strips its routePrefix before forwarding (request arrives as /api/...) or
// forwards the full path (arrives as /_/backend/api/...). Locally and behind
// nginx the bare /api mount is used.
for (const prefix of ['/api', '/_/backend/api']) {
  app.use(prefix, routes);
}

app.use(notFound);
app.use(errorHandler);

export default app;
