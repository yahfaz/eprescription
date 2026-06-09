import { query } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';

const COLUMNS = `id, practice_id, email, first_name, last_name, role, npi, dea_number,
  state_license, phone, email_verified, is_active, last_login_at, created_at`;

// ── GET /users (admin: list practice members) ─────────────────────────────────
export const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM users WHERE practice_id = $1 ORDER BY last_name, first_name`,
    [req.user.practice_id],
  );
  res.json({ data: rows });
});

// ── PATCH /users/:id (admin: role / status / credentials) ─────────────────────
const FIELD_MAP = {
  role: 'role', isActive: 'is_active', npi: 'npi', deaNumber: 'dea_number',
  stateLicense: 'state_license', phone: 'phone', firstName: 'first_name', lastName: 'last_name',
};

export const updateUser = asyncHandler(async (req, res) => {
  // Only allow editing users within the same practice
  const target = await query('SELECT id FROM users WHERE id = $1 AND practice_id = $2', [
    req.params.id, req.user.practice_id,
  ]);
  if (target.rowCount === 0) throw ApiError.notFound('User not found');

  const updates = [];
  const params = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }
  if (updates.length === 0) throw ApiError.badRequest('No fields to update');
  params.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING ${COLUMNS}`,
    params,
  );
  await auditFromRequest(req, { action: 'user.update', entityType: 'user', entityId: req.params.id });
  res.json(rows[0]);
});
