import { query } from '../db/pool.js';
import { getInteractions } from './rxnorm.service.js';

/**
 * Lightweight allergy cross-reactivity map. Maps a documented allergy term to
 * the drug-name fragments that should trigger an alert. This catches the common
 * case where a class allergy (e.g. "penicillin") must flag a member drug
 * (e.g. "amoxicillin"). A production deployment would augment this with a
 * licensed drug-knowledge base (First Databank, Medi-Span) via the network
 * adapter; this built-in map keeps core safety functional out of the box.
 */
const ALLERGY_CROSS_REACTIVITY = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'amox', 'dicloxacillin', 'nafcillin', 'piperacillin'],
  cephalosporin: ['cephalexin', 'cefuroxime', 'ceftriaxone', 'cefdinir', 'cefazolin'],
  sulfa: ['sulfamethoxazole', 'sulfa', 'bactrim', 'sulfadiazine', 'sulfasalazine'],
  'sulfa drugs': ['sulfamethoxazole', 'sulfa', 'bactrim', 'sulfadiazine', 'sulfasalazine'],
  nsaid: ['ibuprofen', 'naproxen', 'ketorolac', 'diclofenac', 'aspirin', 'meloxicam'],
  aspirin: ['aspirin', 'acetylsalicylic'],
  statin: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
  codeine: ['codeine', 'hydrocodone', 'oxycodone', 'morphine'],
};

function allergyMatchesDrug(allergen, drugName) {
  const a = (allergen || '').toLowerCase().trim();
  const drug = (drugName || '').toLowerCase();
  if (!a || !drug) return false;
  // Direct substring either direction (handles exact drug-name allergies)
  if (drug.includes(a) || a.includes(drug)) return true;
  // Class-based cross-reactivity
  const fragments = ALLERGY_CROSS_REACTIVITY[a];
  if (fragments && fragments.some((f) => drug.includes(f))) return true;
  return false;
}

/**
 * Clinical decision support run before a prescription is signed.
 * Returns a list of alerts: allergy conflicts, drug-drug interactions, and
 * duplicate active therapy. Critical alerts must be acknowledged/overridden.
 */
export async function runSafetyChecks({ patientId, medication }) {
  const alerts = [];

  // ── 1. Allergy checking ─────────────────────────────────────────────────────
  const { rows: allergies } = await query(
    `SELECT allergen, rxnorm_cui, severity, reaction
       FROM patient_allergies WHERE patient_id = $1`,
    [patientId],
  );
  for (const a of allergies) {
    const cuiMatch = a.rxnorm_cui && medication.rxnorm_cui && a.rxnorm_cui === medication.rxnorm_cui;
    const nameMatch = allergyMatchesDrug(a.allergen, medication.name);
    if (cuiMatch || nameMatch) {
      alerts.push({
        checkType: 'allergy',
        severity: ['severe', 'life_threatening'].includes(a.severity) ? 'critical' : 'warning',
        message: `Patient has a documented ${a.severity} allergy to "${a.allergen}"${a.reaction ? ` (reaction: ${a.reaction})` : ''}.`,
      });
    }
  }

  // ── 2. Active medication list (for interactions + duplicate therapy) ─────────
  const { rows: active } = await query(
    `SELECT p.drug_name, m.rxnorm_cui
       FROM prescriptions p
       JOIN medications m ON m.id = p.medication_id
      WHERE p.patient_id = $1
        AND p.status IN ('signed','transmitted','dispensed')`,
    [patientId],
  );

  // Duplicate therapy: same RxNorm concept already active
  for (const med of active) {
    if (med.rxnorm_cui && medication.rxnorm_cui && med.rxnorm_cui === medication.rxnorm_cui) {
      alerts.push({
        checkType: 'duplicate_therapy',
        severity: 'warning',
        message: `Patient already has an active prescription for ${med.drug_name}.`,
      });
    }
  }

  // ── 3. Drug-drug interactions via RxNorm ─────────────────────────────────────
  const cuis = [medication.rxnorm_cui, ...active.map((m) => m.rxnorm_cui)].filter(Boolean);
  const uniqueCuis = [...new Set(cuis)];
  if (uniqueCuis.length >= 2) {
    const interactions = await getInteractions(uniqueCuis);
    for (const it of interactions) {
      const sev = /high/i.test(it.severity) ? 'critical' : 'warning';
      alerts.push({
        checkType: 'drug_interaction',
        severity: sev,
        message: it.description || 'Potential drug-drug interaction detected.',
      });
    }
  }

  return alerts;
}

export default { runSafetyChecks };
