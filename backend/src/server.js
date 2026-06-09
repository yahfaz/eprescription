import app from './app.js';
import env from './config/env.js';
import pool from './db/pool.js';

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ePrescribe API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force-exit if connections don't drain in time
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
