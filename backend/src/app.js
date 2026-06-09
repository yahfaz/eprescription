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
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl (no origin) and configured frontends
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
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
