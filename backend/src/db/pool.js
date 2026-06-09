import pg from 'pg';
import env from '../config/env.js';

const { Pool } = pg;

const poolConfig = env.database.url
  ? {
      connectionString: env.database.url,
      ssl: env.database.ssl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: env.database.host,
      port: env.database.port,
      user: env.database.user,
      password: env.database.password,
      database: env.database.database,
      ssl: env.database.ssl ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected idle PostgreSQL client error', err);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Run a set of statements inside a single transaction.
 * The callback receives a dedicated client; commit/rollback is handled here.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
