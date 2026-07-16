import { query } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';
import { getExternalHistory } from '../services/medicationHistory.service.js';

const PATIENT_COLUMNS = `id, practice_id, external_emr_id, mrn, first_name, last_name,
  date_of_birth, sex, phone, email, address_line1, address_line2, city, state,
  postal_code, country, weight_kg, height_cm, notes, is_active, created_at, updated_at`;

// ── GET /patients ──────────────────────────────────────────────────────────────
export const listPatients = asyncHandler(async (req, res) => {
  const practiceId = req.user.practice_id;
  const search = (req.query.search || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  const params = [practiceId];
  let where = 'WHERE practice_id = $1 AND is_active = true';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR mrn ILIKE $${params.length})`;
  }

  const { rows } = await query(
    `SELECT ${PATIENT_COLUMNS} FROM patients ${where}
     ORDER BY last_name, first_name
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM patients ${where}`, params);

  res.json({ data: rows, pagination: { total: countRows[0].total, limit, offset } });
});

// ── GET /patients/:id ────────────────────────────────────────────────────────
export const getPatient = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${PATIENT_COLUMNS} FROM patients WHERE id = $1 AND practice_id = $2`,
    [req.params.id, req.user.practice_id],
  );
  const patient = rows[0];
  if (!patient) throw ApiError.notFound('Patient not found');

  const { rows: allergies } = await query(
    `SELECT id, allergen, rxnorm_cui, reaction, severity, onset_date, created_at
       FROM patient_allergies WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patient.id],
  );
  res.json({ ...patient, allergies });
});

// ── POST /patients ───────────────────────────────────────────────────────────
export const createPatient = asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO patients
       (practice_id, external_emr_id, mrn, first_name, last_name, date_of_birth, sex,
        phone, email, address_line1, address_line2, city, state, postal_code,
        weight_kg, height_cm, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING ${PATIENT_COLUMNS}`,
    [
      req.user.practice_id, b.externalEmrId || null, b.mrn || null, b.firstName, b.lastName,
      b.dateOfBirth, b.sex, b.phone || null, b.email || null, b.addressLine1 || null,
      b.addressLine2 || null, b.city || null, b.state || null, b.postalCode || null,
      b.weightKg ?? null, b.heightCm ?? null, b.notes || null, req.user.id,
    ],
  );
  const patient = rows[0];
  await auditFromRequest(req, { action: 'patient.create', entityType: 'patient', entityId: patient.id });
  res.status(201).json(patient);
});

// ── PATCH /patients/:id ──────────────────────────────────────────────────────
const FIELD_MAP = {
  externalEmrId: 'external_emr_id', mrn: 'mrn', firstName: 'first_name', lastName: 'last_name',
  dateOfBirth: 'date_of_birth', sex: 'sex', phone: 'phone', email: 'email',
  addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', state: 'state',
  postalCode: 'postal_code', weightKg: 'weight_kg', heightCm: 'height_cm', notes: 'notes',
};

export const updatePatient = asyncHandler(async (req, res) => {
  const updates = [];
  const params = [];
  for (const [key, col] of Object.entries(FIELD_MAP)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }
  if (updates.length === 0) throw ApiError.badRequest('No fields to update');

  params.push(req.params.id, req.user.practice_id);
  const { rows } = await query(
    `UPDATE patients SET ${updates.join(', ')}
      WHERE id = $${params.length - 1} AND practice_id = $${params.length}
      RETURNING ${PATIENT_COLUMNS}`,
    params,
  );
  if (rows.length === 0) throw ApiError.notFound('Patient not found');
  await auditFromRequest(req, { action: 'patient.update', entityType: 'patient', entityId: req.params.id });
  res.json(rows[0]);
});

// ── DELETE /patients/:id (soft delete) ────────────────────────────────────────
export const deactivatePatient = asyncHandler(async (req, res) => {
  const { rowCount } = await query(
    'UPDATE patients SET is_active = false WHERE id = $1 AND practice_id = $2',
    [req.params.id, req.user.practice_id],
  );
  if (rowCount === 0) throw ApiError.notFound('Patient not found');
  await auditFromRequest(req, { action: 'patient.deactivate', entityType: 'patient', entityId: req.params.id });
  res.json({ message: 'Patient deactivated' });
});

// ── GET /patients/:id/medication-history ──────────────────────────────────────
// Consolidated view: this practice's prescriptions + simulated external fills.
export const medicationHistory = asyncHandler(async (req, res) => {
  await assertPatientInPractice(req.params.id, req.user.practice_id);

  const { rows: internal } = await query(
    `SELECT p.drug_name, p.sig, p.quantity, p.quantity_unit, p.days_supply, p.status,
            p.dea_schedule, p.written_date, p.created_at,
            u.first_name AS prescriber_first_name, u.last_name AS prescriber_last_name
       FROM prescriptions p
       JOIN users u ON u.id = p.prescriber_id
      WHERE p.patient_id = $1
      ORDER BY p.created_at DESC`,
    [req.params.id],
  );

  const internalItems = internal.map((r) => ({
    source: 'internal',
    drugName: r.drug_name,
    sig: r.sig,
    quantity: r.quantity,
    quantityUnit: r.quantity_unit,
    daysSupply: r.days_supply,
    status: r.status,
    deaSchedule: r.dea_schedule,
    prescriber: `${r.prescriber_first_name} ${r.prescriber_last_name}`,
    date: (r.written_date || r.created_at)?.toISOString?.().slice(0, 10) || String(r.written_date || '').slice(0, 10),
  }));

  const external = getExternalHistory(req.params.id).map((e) => ({ ...e, date: e.lastFillDate }));

  const medications = [...internalItems, ...external].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.json({ data: medications, counts: { internal: internalItems.length, external: external.length } });
});

// ── Allergies ────────────────────────────────────────────────────────────────
async function assertPatientInPractice(patientId, practiceId) {
  const { rows } = await query('SELECT id FROM patients WHERE id = $1 AND practice_id = $2', [patientId, practiceId]);
  if (rows.length === 0) throw ApiError.notFound('Patient not found');
}

export const addAllergy = asyncHandler(async (req, res) => {
  await assertPatientInPractice(req.params.id, req.user.practice_id);
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO patient_allergies (patient_id, allergen, rxnorm_cui, reaction, severity, onset_date)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, allergen, rxnorm_cui, reaction, severity, onset_date, created_at`,
    [req.params.id, b.allergen, b.rxnormCui || null, b.reaction || null, b.severity, b.onsetDate || null],
  );
  await auditFromRequest(req, { action: 'patient.allergy.add', entityType: 'patient', entityId: req.params.id });
  res.status(201).json(rows[0]);
});

export const removeAllergy = asyncHandler(async (req, res) => {
  await assertPatientInPractice(req.params.id, req.user.practice_id);
  const { rowCount } = await query('DELETE FROM patient_allergies WHERE id = $1 AND patient_id = $2', [
    req.params.allergyId,
    req.params.id,
  ]);
  if (rowCount === 0) throw ApiError.notFound('Allergy not found');
  await auditFromRequest(req, { action: 'patient.allergy.remove', entityType: 'patient', entityId: req.params.id });
  res.json({ message: 'Allergy removed' });
});
