import { query } from '../db/pool.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';

const COLUMNS = `id, ncpdp_id, npi, name, phone, fax, address_line1, address_line2,
  city, state, postal_code, accepts_eprescribe, accepts_controlled, created_at`;

// ── GET /pharmacies?search= ──────────────────────────────────────────────────
export const listPharmacies = asyncHandler(async (req, res) => {
  const search = (req.query.search || '').trim();
  const params = [];
  let where = 'WHERE accepts_eprescribe = true';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (name ILIKE $${params.length} OR city ILIKE $${params.length} OR postal_code ILIKE $${params.length})`;
  }
  const { rows } = await query(`SELECT ${COLUMNS} FROM pharmacies ${where} ORDER BY name LIMIT 50`, params);
  res.json({ data: rows });
});

// ── POST /pharmacies (admin) ──────────────────────────────────────────────────
export const createPharmacy = asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO pharmacies (ncpdp_id, npi, name, phone, fax, address_line1, city, state, postal_code, accepts_controlled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLUMNS}`,
    [b.ncpdpId || null, b.npi || null, b.name, b.phone || null, b.fax || null, b.addressLine1 || null,
     b.city || null, b.state || null, b.postalCode || null, b.acceptsControlled],
  );
  await auditFromRequest(req, { action: 'pharmacy.create', entityType: 'pharmacy', entityId: rows[0].id });
  res.status(201).json(rows[0]);
});
