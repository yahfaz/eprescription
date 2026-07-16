import { query } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { auditFromRequest } from '../services/audit.service.js';

const COLUMNS = `id, user_id, medication_id, rxnorm_cui, label, drug_name, sig,
  quantity, quantity_unit, days_supply, refills, created_at`;

// ── GET /favorites (current user's quick-prescribe list) ──────────────────────
export const listFavorites = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM medication_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id],
  );
  res.json({ data: rows });
});

// ── POST /favorites ───────────────────────────────────────────────────────────
export const createFavorite = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.drugName) throw ApiError.badRequest('drugName is required');
  const { rows } = await query(
    `INSERT INTO medication_favorites
       (user_id, practice_id, medication_id, rxnorm_cui, label, drug_name, sig,
        quantity, quantity_unit, days_supply, refills)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${COLUMNS}`,
    [
      req.user.id, req.user.practice_id, b.medicationId || null, b.rxnormCui || null,
      b.label || null, b.drugName, b.sig || null, b.quantity ?? null,
      b.quantityUnit || 'each', b.daysSupply ?? null, b.refills ?? 0,
    ],
  );
  await auditFromRequest(req, { action: 'favorite.create', entityType: 'favorite', entityId: rows[0].id });
  res.status(201).json(rows[0]);
});

// ── DELETE /favorites/:id ─────────────────────────────────────────────────────
export const deleteFavorite = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM medication_favorites WHERE id = $1 AND user_id = $2', [
    req.params.id, req.user.id,
  ]);
  if (rowCount === 0) throw ApiError.notFound('Favorite not found');
  res.json({ message: 'Favorite removed' });
});
