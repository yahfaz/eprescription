import { query } from '../db/pool.js';
import asyncHandler from '../utils/asyncHandler.js';

// ── GET /audit-logs (admin) ───────────────────────────────────────────────────
export const listAuditLogs = asyncHandler(async (req, res) => {
  const params = [req.user.practice_id];
  let where = 'WHERE a.practice_id = $1';
  if (req.query.action) {
    params.push(req.query.action);
    where += ` AND a.action = $${params.length}`;
  }
  if (req.query.entityType) {
    params.push(req.query.entityType);
    where += ` AND a.entity_type = $${params.length}`;
  }
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  const { rows } = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip_address, a.metadata, a.created_at,
            u.first_name, u.last_name, u.email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ data: rows, pagination: { limit, offset } });
});
