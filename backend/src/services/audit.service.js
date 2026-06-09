import { query } from '../db/pool.js';

/**
 * Append an entry to the immutable audit log. Failures are logged but never
 * block the primary request — auditing must not break clinical workflows.
 */
export async function recordAudit({
  userId = null,
  practiceId = null,
  action,
  entityType = null,
  entityId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (user_id, practice_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        userId,
        practiceId,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log:', err.message);
  }
}

/** Convenience helper that pulls actor/context from the request. */
export function auditFromRequest(req, fields) {
  return recordAudit({
    userId: req.user?.id || null,
    practiceId: req.user?.practice_id || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    ...fields,
  });
}
