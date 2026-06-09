import { query } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { searchDrugs, getDrugProperties } from '../services/rxnorm.service.js';

const MED_COLUMNS = `id, rxnorm_cui, name, tty, strength, dose_form, route, ndc, dea_schedule, is_active`;

/**
 * Ensures a medication exists in the local catalog for a given RxNorm CUI,
 * fetching from RxNorm if needed. Returns the medication row.
 * Exposed for reuse by the prescriptions controller.
 */
export async function resolveMedicationByCui(rxcui) {
  const existing = await query(`SELECT ${MED_COLUMNS} FROM medications WHERE rxnorm_cui = $1`, [rxcui]);
  if (existing.rows[0]) return existing.rows[0];

  const props = await getDrugProperties(rxcui);
  if (!props) throw ApiError.badRequest(`Unknown RxNorm concept: ${rxcui}`);

  const { rows } = await query(
    `INSERT INTO medications (rxnorm_cui, name, tty)
     VALUES ($1,$2,$3)
     ON CONFLICT (rxnorm_cui) DO UPDATE SET name = EXCLUDED.name
     RETURNING ${MED_COLUMNS}`,
    [props.rxnormCui, props.name, props.tty || null],
  );
  return rows[0];
}

// ── GET /medications/search?q= ────────────────────────────────────────────────
export const search = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) throw ApiError.badRequest('Search term must be at least 2 characters');

  // Always include locally seeded matches (works offline / for custom entries)
  const { rows: local } = await query(
    `SELECT ${MED_COLUMNS} FROM medications
      WHERE is_active = true AND name ILIKE $1
      ORDER BY name LIMIT 10`,
    [`%${q}%`],
  );

  let remote = [];
  try {
    remote = await searchDrugs(q);
  } catch (err) {
    // RxNorm unreachable — degrade to local results only
    // eslint-disable-next-line no-console
    console.warn('RxNorm search failed, using local catalog only:', err.message);
  }

  // Merge, de-duplicating on rxnorm cui / name
  const seen = new Set(local.map((m) => m.rxnorm_cui).filter(Boolean));
  const merged = [
    ...local.map((m) => ({ source: 'local', ...m })),
    ...remote
      .filter((r) => !seen.has(r.rxnormCui))
      .map((r) => ({ source: 'rxnorm', rxnorm_cui: r.rxnormCui, name: r.name, tty: r.tty, dea_schedule: 0 })),
  ];

  res.json({ data: merged });
});

// ── GET /medications ──────────────────────────────────────────────────────────
export const list = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${MED_COLUMNS} FROM medications WHERE is_active = true ORDER BY name LIMIT 200`,
  );
  res.json({ data: rows });
});

// ── POST /medications/resolve { rxnormCui } ───────────────────────────────────
export const resolve = asyncHandler(async (req, res) => {
  const rxcui = req.body?.rxnormCui;
  if (!rxcui) throw ApiError.badRequest('rxnormCui is required');
  const med = await resolveMedicationByCui(String(rxcui));
  res.json(med);
});
