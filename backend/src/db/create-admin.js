import pool, { query, withTransaction } from './pool.js';
import { hashPassword } from '../utils/crypto.js';

/**
 * Create (or update) a verified admin user from the command line — handy for
 * bootstrapping a fresh deployment without SMTP/email verification.
 *
 * Usage:
 *   npm run create-admin -- --email you@practice.com --password "StrongPass123!" \
 *     --name "Jane Doe" --practice "My Medical Practice" [--role admin]
 *
 * Or via environment variables:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_PRACTICE, ADMIN_ROLE
 *
 * If the email already exists, its password is reset and the account is
 * verified/activated (idempotent — safe to re-run).
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const VALID_ROLES = ['admin', 'prescriber', 'nurse', 'staff', 'pharmacist'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email || process.env.ADMIN_EMAIL;
  const password = args.password || process.env.ADMIN_PASSWORD;
  const fullName = args.name || process.env.ADMIN_NAME || 'Account Admin';
  const practiceName = args.practice || process.env.ADMIN_PRACTICE || 'My Practice';
  const role = (args.role || process.env.ADMIN_ROLE || 'admin').toLowerCase();

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error(
      'Missing required values.\n' +
        'Usage: npm run create-admin -- --email you@practice.com --password "StrongPass123!" ' +
        '--name "Jane Doe" --practice "My Practice" [--role admin]',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    // eslint-disable-next-line no-console
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    // eslint-disable-next-line no-console
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;
  const passwordHash = await hashPassword(password);

  const result = await withTransaction(async (client) => {
    const existing = await client.query('SELECT id, practice_id FROM users WHERE email = $1', [email]);

    if (existing.rowCount > 0) {
      const user = existing.rows[0];
      await client.query(
        `UPDATE users
            SET password_hash = $2, role = $3, email_verified = true, is_active = true
          WHERE id = $1`,
        [user.id, passwordHash, role],
      );
      return { id: user.id, created: false };
    }

    // Reuse an existing practice with this name, otherwise create one
    let practiceId;
    const practice = await client.query('SELECT id FROM practices WHERE name = $1 LIMIT 1', [practiceName]);
    if (practice.rowCount > 0) {
      practiceId = practice.rows[0].id;
    } else {
      const created = await client.query('INSERT INTO practices (name) VALUES ($1) RETURNING id', [practiceName]);
      practiceId = created.rows[0].id;
    }

    const inserted = await client.query(
      `INSERT INTO users
         (practice_id, email, password_hash, first_name, last_name, role, email_verified, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true,true)
       RETURNING id`,
      [practiceId, email, passwordHash, firstName, lastName, role],
    );
    return { id: inserted.rows[0].id, created: true };
  });

  // eslint-disable-next-line no-console
  console.log(
    `✓ ${result.created ? 'Created' : 'Updated'} verified ${role} account:\n` +
      `   email:    ${email}\n` +
      `   practice: ${practiceName}\n` +
      `   You can log in immediately.`,
  );
  await pool.end();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('create-admin failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
