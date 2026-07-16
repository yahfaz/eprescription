import { query } from '../db/pool.js';
import asyncHandler from '../utils/asyncHandler.js';

// ── GET /reports/summary ──────────────────────────────────────────────────────
// Practice-level prescribing analytics for the dashboard.
export const summary = asyncHandler(async (req, res) => {
  const practiceId = req.user.practice_id;

  const [byStatus, controlled, topMeds, byPrescriber, totals, pending] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count FROM prescriptions
        WHERE practice_id = $1 GROUP BY status`,
      [practiceId],
    ),
    query(
      `SELECT CASE WHEN dea_schedule >= 2 THEN 'controlled' ELSE 'non_controlled' END AS kind,
              COUNT(*)::int AS count
         FROM prescriptions WHERE practice_id = $1 GROUP BY kind`,
      [practiceId],
    ),
    query(
      `SELECT drug_name, COUNT(*)::int AS count FROM prescriptions
        WHERE practice_id = $1 GROUP BY drug_name ORDER BY count DESC LIMIT 10`,
      [practiceId],
    ),
    query(
      `SELECT u.first_name, u.last_name, COUNT(p.*)::int AS count
         FROM prescriptions p JOIN users u ON u.id = p.prescriber_id
        WHERE p.practice_id = $1 GROUP BY u.id, u.first_name, u.last_name
        ORDER BY count DESC LIMIT 10`,
      [practiceId],
    ),
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM patients WHERE practice_id = $1 AND is_active = true) AS active_patients,
         (SELECT COUNT(*)::int FROM prescriptions WHERE practice_id = $1) AS total_prescriptions,
         (SELECT COUNT(*)::int FROM prescriptions
            WHERE practice_id = $1 AND transmitted_at >= now() - interval '30 days') AS transmitted_30d`,
      [practiceId],
    ),
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM renewal_requests WHERE practice_id = $1 AND status = 'pending') AS pending_renewals,
         (SELECT COUNT(*)::int FROM prescriptions
            WHERE practice_id = $1 AND prior_auth_status IN ('required','initiated','pending')) AS open_prior_auths`,
      [practiceId],
    ),
  ]);

  res.json({
    totals: totals.rows[0],
    pending: pending.rows[0],
    byStatus: byStatus.rows,
    controlled: controlled.rows,
    topMedications: topMeds.rows,
    byPrescriber: byPrescriber.rows,
  });
});
