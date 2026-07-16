import crypto from 'node:crypto';

/**
 * Medication history.
 *
 * Surescripts / DoseSpot / DrFirst surface an aggregated view of a patient's
 * medication fills over the last ~12 months, sourced from pharmacies and PBMs.
 * That live feed requires a certified network connection. This module returns a
 * deterministic, clearly-labeled *simulated* external history so the
 * consolidated view is functional out of the box; the real feed drops in behind
 * `getExternalHistory()` once connected.
 */

const EXTERNAL_POOL = [
  { drugName: 'Hydrochlorothiazide 25 MG Oral Tablet', sig: 'Take 1 tablet by mouth every morning', daysSupply: 90 },
  { drugName: 'Metoprolol Succinate 50 MG Extended Release Tablet', sig: 'Take 1 tablet by mouth daily', daysSupply: 30 },
  { drugName: 'Sertraline 50 MG Oral Tablet', sig: 'Take 1 tablet by mouth daily', daysSupply: 30 },
  { drugName: 'Albuterol 90 MCG/Actuation Inhaler', sig: 'Inhale 2 puffs every 4-6 hours as needed', daysSupply: 30 },
  { drugName: 'Gabapentin 300 MG Oral Capsule', sig: 'Take 1 capsule by mouth three times daily', daysSupply: 30 },
  { drugName: 'Losartan 50 MG Oral Tablet', sig: 'Take 1 tablet by mouth daily', daysSupply: 90 },
  { drugName: 'Montelukast 10 MG Oral Tablet', sig: 'Take 1 tablet by mouth at bedtime', daysSupply: 30 },
];
const PHARMACIES = ['CVS Pharmacy #4821', 'Walgreens #1107', 'Community Care Compounding'];

function intFromHash(str, mod) {
  const h = crypto.createHash('sha256').update(str).digest();
  return h.readUInt32BE(0) % mod;
}

/**
 * Deterministic simulated external fill history for a patient.
 * `now` is injectable so callers can keep results stable in tests.
 */
export function getExternalHistory(patientId, now = Date.now()) {
  const count = 2 + intFromHash(`${patientId}:count`, 3); // 2–4 entries
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const med = EXTERNAL_POOL[intFromHash(`${patientId}:${i}:med`, EXTERNAL_POOL.length)];
    const daysAgo = 20 + intFromHash(`${patientId}:${i}:days`, 300);
    const lastFill = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    out.push({
      source: 'external',
      drugName: med.drugName,
      sig: med.sig,
      daysSupply: med.daysSupply,
      status: 'dispensed',
      pharmacyName: PHARMACIES[intFromHash(`${patientId}:${i}:ph`, PHARMACIES.length)],
      lastFillDate: lastFill.toISOString().slice(0, 10),
    });
  }
  return out;
}

export default { getExternalHistory };
