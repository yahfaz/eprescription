import { query, withTransaction } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';

const SELECT = `
  r.id, r.patient_id, r.prescriber_id, r.prescription_id, r.pharmacy_id, r.drug_name,
  r.sig, r.quantity, r.quantity_unit, r.days_supply, r.refills, r.requested_by, r.note,
  r.status, r.responded_at, r.resulting_rx_id, r.created_at,
  pt.first_name AS patient_first_name, pt.last_name AS patient_last_name,
  ph.name AS pharmacy_name`;

const JOINS = `
  FROM renewal_requests r
  JOIN patients pt ON pt.id = r.patient_id
  LEFT JOIN pharmacies ph ON ph.id = r.pharmacy_id`;

// ── GET /renewals?status=pending ──────────────────────────────────────────────
export const listRenewals = asyncHandler(async (req, res) => {
  const params = [req.user.practice_id];
  let where = 'WHERE r.practice_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND r.status = $${params.length}`;
  }
  const { rows } = await query(`SELECT ${SELECT} ${JOINS} ${where} ORDER BY r.created_at DESC LIMIT 100`, params);
  res.json({ data: rows });
});

// ── POST /renewals  (simulate a pharmacy-initiated renewal request) ───────────
// Body: { prescriptionId }  — creates a pending renewal request from an existing Rx.
export const createRenewal = asyncHandler(async (req, res) => {
  const { prescriptionId, requestedBy, note } = req.body;
  if (!prescriptionId) throw ApiError.badRequest('prescriptionId is required');

  const { rows } = await query(
    `SELECT * FROM prescriptions WHERE id = $1 AND practice_id = $2`,
    [prescriptionId, req.user.practice_id],
  );
  const rx = rows[0];
  if (!rx) throw ApiError.notFound('Prescription not found');

  const { rows: created } = await query(
    `INSERT INTO renewal_requests
       (practice_id, patient_id, prescriber_id, prescription_id, pharmacy_id, drug_name,
        sig, quantity, quantity_unit, days_supply, refills, requested_by, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      req.user.practice_id, rx.patient_id, rx.prescriber_id, rx.id, rx.pharmacy_id, rx.drug_name,
      rx.sig, rx.quantity, rx.quantity_unit, rx.days_supply, rx.refills,
      requestedBy || 'Pharmacy renewal request', note || null,
    ],
  );
  await auditFromRequest(req, { action: 'renewal.create', entityType: 'renewal', entityId: created[0].id });
  res.status(201).json({ id: created[0].id, status: 'pending' });
});

// ── POST /renewals/:id/respond  { action: 'approve'|'deny', note? } ───────────
export const respondRenewal = asyncHandler(async (req, res) => {
  const action = req.body?.action;
  if (!['approve', 'deny'].includes(action)) throw ApiError.badRequest("action must be 'approve' or 'deny'");
  if (req.user.role !== 'admin' && req.user.role !== 'prescriber') {
    throw ApiError.forbidden('Only prescribers may respond to renewal requests');
  }

  const { rows } = await query(
    `SELECT * FROM renewal_requests WHERE id = $1 AND practice_id = $2`,
    [req.params.id, req.user.practice_id],
  );
  const rr = rows[0];
  if (!rr) throw ApiError.notFound('Renewal request not found');
  if (rr.status !== 'pending') throw ApiError.conflict('Renewal request already handled');

  let resultingRxId = null;
  await withTransaction(async (client) => {
    if (action === 'approve') {
      // Create a new draft prescription continuing therapy, linked to the original
      const { rows: medRows } = await client.query(
        `SELECT medication_id, dea_schedule FROM prescriptions WHERE id = $1`,
        [rr.prescription_id],
      );
      const med = medRows[0] || {};
      const { rows: newRx } = await client.query(
        `INSERT INTO prescriptions
           (practice_id, patient_id, prescriber_id, medication_id, pharmacy_id, drug_name,
            dea_schedule, sig, quantity, quantity_unit, days_supply, refills, status,
            renewed_from_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14)
         RETURNING id`,
        [
          rr.practice_id, rr.patient_id, rr.prescriber_id || req.user.id, med.medication_id,
          rr.pharmacy_id, rr.drug_name, med.dea_schedule || 0, rr.sig, rr.quantity,
          rr.quantity_unit, rr.days_supply, rr.refills, rr.prescription_id, req.user.id,
        ],
      );
      resultingRxId = newRx[0].id;
      await client.query(
        `INSERT INTO prescription_events (prescription_id, from_status, to_status, actor_id, detail)
         VALUES ($1, NULL, 'draft', $2, 'Created from renewal request')`,
        [resultingRxId, req.user.id],
      );
    }
    await client.query(
      `UPDATE renewal_requests
          SET status = $2, responded_at = now(), responded_by = $3, resulting_rx_id = $4
        WHERE id = $1`,
      [rr.id, action === 'approve' ? 'approved' : 'denied', req.user.id, resultingRxId],
    );
  });

  await auditFromRequest(req, { action: `renewal.${action}`, entityType: 'renewal', entityId: rr.id });
  res.json({ id: rr.id, status: action === 'approve' ? 'approved' : 'denied', resultingRxId });
});
