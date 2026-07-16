import { query, withTransaction } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';
import { runSafetyChecks } from '../services/safety.service.js';
import { transmitPrescription, cancelPrescription as cancelOnNetwork } from '../services/pharmacy.service.js';
import { checkBenefit } from '../services/benefit.service.js';
import { resolveMedicationByCui } from './medications.controller.js';

const RX_SELECT = `
  p.id, p.practice_id, p.patient_id, p.prescriber_id, p.medication_id, p.pharmacy_id,
  p.drug_name, p.dea_schedule, p.sig, p.quantity, p.quantity_unit, p.days_supply,
  p.refills, p.substitution_allowed, p.note_to_pharmacist, p.diagnosis_code,
  p.status, p.signed_at, p.transmitted_at, p.network_message_id, p.cancel_reason,
  p.prior_auth_status, p.prior_auth_number, p.renewed_from_id,
  p.written_date, p.expires_on, p.created_at, p.updated_at,
  pt.first_name AS patient_first_name, pt.last_name AS patient_last_name, pt.date_of_birth AS patient_dob,
  u.first_name AS prescriber_first_name, u.last_name AS prescriber_last_name,
  ph.name AS pharmacy_name`;

const RX_JOINS = `
  FROM prescriptions p
  JOIN patients pt ON pt.id = p.patient_id
  JOIN users u ON u.id = p.prescriber_id
  LEFT JOIN pharmacies ph ON ph.id = p.pharmacy_id`;

async function loadPrescription(id, practiceId) {
  const { rows } = await query(
    `SELECT ${RX_SELECT} ${RX_JOINS} WHERE p.id = $1 AND p.practice_id = $2`,
    [id, practiceId],
  );
  return rows[0] || null;
}

async function logEvent(client, prescriptionId, fromStatus, toStatus, actorId, detail) {
  await client.query(
    `INSERT INTO prescription_events (prescription_id, from_status, to_status, actor_id, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [prescriptionId, fromStatus, toStatus, actorId, detail || null],
  );
}

// ── GET /prescriptions ─────────────────────────────────────────────────────────
export const listPrescriptions = asyncHandler(async (req, res) => {
  const params = [req.user.practice_id];
  let where = 'WHERE p.practice_id = $1';
  if (req.query.patientId) {
    params.push(req.query.patientId);
    where += ` AND p.patient_id = $${params.length}`;
  }
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND p.status = $${params.length}`;
  }
  const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  const { rows } = await query(
    `SELECT ${RX_SELECT} ${RX_JOINS} ${where}
      ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ data: rows, pagination: { limit, offset } });
});

// ── GET /prescriptions/:id ──────────────────────────────────────────────────────
export const getPrescription = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');

  const { rows: events } = await query(
    `SELECT id, from_status, to_status, actor_id, detail, created_at
       FROM prescription_events WHERE prescription_id = $1 ORDER BY created_at ASC`,
    [rx.id],
  );
  const { rows: checks } = await query(
    `SELECT check_type, severity, message, overridden, override_reason, created_at
       FROM prescription_safety_checks WHERE prescription_id = $1 ORDER BY created_at ASC`,
    [rx.id],
  );
  res.json({ ...rx, events, safetyChecks: checks });
});

// ── POST /prescriptions ─────────────────────────────────────────────────────────
export const createPrescription = asyncHandler(async (req, res) => {
  const b = req.body;

  // Patient must belong to the user's practice
  const { rows: patientRows } = await query(
    'SELECT id FROM patients WHERE id = $1 AND practice_id = $2 AND is_active = true',
    [b.patientId, req.user.practice_id],
  );
  if (patientRows.length === 0) throw ApiError.notFound('Patient not found');

  // Resolve medication either from local catalog id or RxNorm cui
  let medication;
  if (b.medicationId) {
    const { rows } = await query('SELECT * FROM medications WHERE id = $1', [b.medicationId]);
    medication = rows[0];
    if (!medication) throw ApiError.badRequest('Medication not found');
  } else {
    medication = await resolveMedicationByCui(String(b.rxnormCui));
  }

  // Default prescriber is the current user if they are a prescriber
  const prescriberId = b.prescriberId || req.user.id;

  const rx = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO prescriptions
         (practice_id, patient_id, prescriber_id, medication_id, pharmacy_id, drug_name,
          dea_schedule, sig, quantity, quantity_unit, days_supply, refills,
          substitution_allowed, note_to_pharmacist, diagnosis_code, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16)
       RETURNING id, status`,
      [
        req.user.practice_id, b.patientId, prescriberId, medication.id, b.pharmacyId || null,
        medication.name, medication.dea_schedule || 0, b.sig, b.quantity, b.quantityUnit,
        b.daysSupply ?? null, b.refills, b.substitutionAllowed, b.noteToPharmacist || null,
        b.diagnosisCode || null, req.user.id,
      ],
    );
    await logEvent(client, rows[0].id, null, 'draft', req.user.id, 'Prescription drafted');
    return rows[0];
  });

  await auditFromRequest(req, { action: 'rx.create', entityType: 'prescription', entityId: rx.id });
  const full = await loadPrescription(rx.id, req.user.practice_id);
  res.status(201).json(full);
});

// ── PATCH /prescriptions/:id (drafts only) ───────────────────────────────────────
const RX_FIELD_MAP = {
  pharmacyId: 'pharmacy_id', sig: 'sig', quantity: 'quantity', quantityUnit: 'quantity_unit',
  daysSupply: 'days_supply', refills: 'refills', substitutionAllowed: 'substitution_allowed',
  noteToPharmacist: 'note_to_pharmacist', diagnosisCode: 'diagnosis_code',
};

export const updatePrescription = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  if (rx.status !== 'draft') throw ApiError.conflict('Only draft prescriptions can be edited');

  const updates = [];
  const params = [];
  for (const [key, col] of Object.entries(RX_FIELD_MAP)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }
  if (updates.length === 0) throw ApiError.badRequest('No fields to update');
  params.push(rx.id);
  await query(`UPDATE prescriptions SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

  await auditFromRequest(req, { action: 'rx.update', entityType: 'prescription', entityId: rx.id });
  res.json(await loadPrescription(rx.id, req.user.practice_id));
});

// ── GET /prescriptions/:id/safety-check ───────────────────────────────────────────
export const previewSafetyChecks = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  const { rows: medRows } = await query('SELECT * FROM medications WHERE id = $1', [rx.medication_id]);
  const alerts = await runSafetyChecks({ patientId: rx.patient_id, medication: medRows[0] });
  res.json({ alerts });
});

// ── POST /prescriptions/:id/sign ──────────────────────────────────────────────────
export const signPrescription = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  if (rx.status !== 'draft' && rx.status !== 'pending_review') {
    throw ApiError.conflict(`Cannot sign a prescription in status "${rx.status}"`);
  }

  // Only DEA-registered prescribers may sign; controlled substances require a DEA number
  if (req.user.role !== 'prescriber' && req.user.role !== 'admin') {
    throw ApiError.forbidden('Only prescribers may sign prescriptions');
  }
  if (rx.dea_schedule >= 2 && !req.user.dea_number) {
    throw ApiError.forbidden('A DEA number is required to prescribe controlled substances');
  }

  const { rows: medRows } = await query('SELECT * FROM medications WHERE id = $1', [rx.medication_id]);
  const alerts = await runSafetyChecks({ patientId: rx.patient_id, medication: medRows[0] });

  // Critical alerts must each be explicitly overridden with a reason
  const overrides = req.body.overrides || [];
  const unresolvedCritical = alerts.filter(
    (a) => a.severity === 'critical' && !overrides.find((o) => o.checkType === a.checkType),
  );
  if (unresolvedCritical.length > 0) {
    throw ApiError.unprocessable('Critical safety alerts must be acknowledged before signing', {
      alerts: unresolvedCritical,
    });
  }

  await withTransaction(async (client) => {
    for (const a of alerts) {
      const ov = overrides.find((o) => o.checkType === a.checkType);
      await client.query(
        `INSERT INTO prescription_safety_checks
           (prescription_id, check_type, severity, message, overridden, override_reason)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rx.id, a.checkType, a.severity, a.message, !!ov, ov?.reason || null],
      );
    }
    await client.query(
      `UPDATE prescriptions SET status = 'signed', signed_at = now(), signed_by = $2,
         expires_on = CURRENT_DATE + INTERVAL '1 year'
       WHERE id = $1`,
      [rx.id, req.user.id],
    );
    await logEvent(client, rx.id, rx.status, 'signed', req.user.id, 'Electronically signed');
  });

  await auditFromRequest(req, {
    action: 'rx.sign',
    entityType: 'prescription',
    entityId: rx.id,
    metadata: { overrides: overrides.map((o) => o.checkType) },
  });
  res.json(await loadPrescription(rx.id, req.user.practice_id));
});

// ── POST /prescriptions/:id/transmit ───────────────────────────────────────────────
export const transmitPrescriptionHandler = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  if (rx.status !== 'signed') throw ApiError.conflict('Only signed prescriptions can be transmitted');
  if (!rx.pharmacy_id) throw ApiError.badRequest('Select a pharmacy before transmitting');

  let result;
  try {
    result = await transmitPrescription(rx);
  } catch (err) {
    await withTransaction(async (client) => {
      await logEvent(client, rx.id, 'signed', 'error', req.user.id, err.message);
    });
    throw ApiError.badRequest(`Transmission failed: ${err.message}`);
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE prescriptions SET status = 'transmitted', transmitted_at = now(), network_message_id = $2
       WHERE id = $1`,
      [rx.id, result.networkMessageId],
    );
    await logEvent(client, rx.id, 'signed', 'transmitted', req.user.id, `Sent via ${result.transport}`);
  });

  await auditFromRequest(req, {
    action: 'rx.transmit',
    entityType: 'prescription',
    entityId: rx.id,
    metadata: { networkMessageId: result.networkMessageId },
  });
  res.json(await loadPrescription(rx.id, req.user.practice_id));
});

// ── POST /prescriptions/benefit-check  (Real-Time Prescription Benefit) ───────────
// Body: { medicationId | rxnormCui, daysSupply? } — a point-of-prescribing preview.
export const benefitCheck = asyncHandler(async (req, res) => {
  let medication;
  if (req.body.medicationId) {
    const { rows } = await query('SELECT * FROM medications WHERE id = $1', [req.body.medicationId]);
    medication = rows[0];
    if (!medication) throw ApiError.badRequest('Medication not found');
  } else if (req.body.rxnormCui) {
    medication = await resolveMedicationByCui(String(req.body.rxnormCui));
  } else {
    throw ApiError.badRequest('medicationId or rxnormCui is required');
  }
  const benefit = await checkBenefit({ medication, daysSupply: req.body.daysSupply });
  res.json(benefit);
});

// ── POST /prescriptions/:id/prior-auth  { status, priorAuthNumber? } ─────────────
const PA_TRANSITIONS = ['required', 'initiated', 'pending', 'approved', 'denied', 'not_required'];
export const updatePriorAuth = asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (!PA_TRANSITIONS.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${PA_TRANSITIONS.join(', ')}`);
  }
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');

  await query(
    'UPDATE prescriptions SET prior_auth_status = $2, prior_auth_number = COALESCE($3, prior_auth_number) WHERE id = $1',
    [rx.id, status, req.body.priorAuthNumber || null],
  );
  await auditFromRequest(req, {
    action: 'rx.prior_auth',
    entityType: 'prescription',
    entityId: rx.id,
    metadata: { status },
  });
  res.json(await loadPrescription(rx.id, req.user.practice_id));
});

// ── POST /prescriptions/:id/cancel ───────────────────────────────────────────────
export const cancelPrescriptionHandler = asyncHandler(async (req, res) => {
  const rx = await loadPrescription(req.params.id, req.user.practice_id);
  if (!rx) throw ApiError.notFound('Prescription not found');
  if (['dispensed', 'cancelled', 'expired'].includes(rx.status)) {
    throw ApiError.conflict(`Cannot cancel a prescription in status "${rx.status}"`);
  }

  // If already transmitted, send a cancellation message to the network
  if (rx.status === 'transmitted') {
    try {
      await cancelOnNetwork(rx, req.body.reason);
    } catch (err) {
      throw ApiError.badRequest(`Network cancellation failed: ${err.message}`);
    }
  }

  await withTransaction(async (client) => {
    await client.query('UPDATE prescriptions SET status = $2, cancel_reason = $3 WHERE id = $1', [
      rx.id, 'cancelled', req.body.reason,
    ]);
    await logEvent(client, rx.id, rx.status, 'cancelled', req.user.id, req.body.reason);
  });

  await auditFromRequest(req, { action: 'rx.cancel', entityType: 'prescription', entityId: rx.id });
  res.json(await loadPrescription(rx.id, req.user.practice_id));
});
