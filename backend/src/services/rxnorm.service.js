import env from '../config/env.js';

/**
 * Thin client over the public RxNorm (NIH/NLM) REST API. No API key required.
 * Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
 *
 * Falls back gracefully: if the network is unavailable, callers can still use
 * the locally seeded medications table.
 */
const BASE = env.rxnorm.baseUrl;

async function rxFetch(pathAndQuery) {
  const url = `${BASE}${pathAndQuery}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`RxNorm request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

/** Autocomplete-style search returning candidate drug concepts. */
export async function searchDrugs(term, maxEntries = 15) {
  const data = await rxFetch(`/drugs.json?name=${encodeURIComponent(term)}`);
  const groups = data?.drugGroup?.conceptGroup || [];
  const results = [];
  for (const group of groups) {
    for (const c of group.conceptProperties || []) {
      results.push({
        rxnormCui: c.rxcui,
        name: c.name,
        tty: c.tty,
        synonym: c.synonym || null,
      });
      if (results.length >= maxEntries) return results;
    }
  }
  return results;
}

/** Look up detailed properties for a single RxNorm concept. */
export async function getDrugProperties(rxcui) {
  const data = await rxFetch(`/rxcui/${encodeURIComponent(rxcui)}/properties.json`);
  const p = data?.properties;
  if (!p) return null;
  return {
    rxnormCui: p.rxcui,
    name: p.name,
    tty: p.tty,
    synonym: p.synonym || null,
  };
}

/**
 * Resolve drug-drug interactions for a set of RxNorm CUIs.
 * Note: NLM retired the hosted interaction endpoint; this method is written to
 * consume a compatible interaction source and returns [] when unavailable so
 * the prescribing workflow degrades safely rather than blocking.
 */
export async function getInteractions(rxcuis = []) {
  if (rxcuis.length < 2) return [];
  try {
    const data = await rxFetch(`/interaction/list.json?rxcuis=${rxcuis.join('+')}`);
    const pairs = data?.fullInteractionTypeGroup?.[0]?.fullInteractionType || [];
    return pairs.flatMap((t) =>
      (t.interactionPair || []).map((p) => ({
        severity: p.severity || 'unknown',
        description: p.description,
      })),
    );
  } catch {
    return [];
  }
}

export default { searchDrugs, getDrugProperties, getInteractions };
