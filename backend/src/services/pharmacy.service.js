import { randomUUID } from 'node:crypto';
import env from '../config/env.js';

/**
 * Pharmacy network adapter.
 *
 * E-prescriptions in the US are routed to pharmacies over the Surescripts
 * network using the NCPDP SCRIPT standard. Live transmission requires
 * Surescripts certification and credentials, which a practice obtains during
 * onboarding. This module abstracts that behind a single `transmit()` call so
 * the rest of the app is network-agnostic.
 *
 *   PHARMACY_NETWORK=internal     -> simulated routing (works out of the box)
 *   PHARMACY_NETWORK=surescripts  -> real network (requires credentials)
 */

class InternalNetworkAdapter {
  // Simulates an NCPDP SCRIPT NewRx round-trip. Returns a network message id.
  async transmit(prescription) {
    return {
      accepted: true,
      networkMessageId: `INT-${randomUUID()}`,
      transport: 'internal-simulated',
      transmittedAt: new Date().toISOString(),
    };
  }

  async cancel(prescription, reason) {
    return {
      accepted: true,
      networkMessageId: `INT-CANRX-${randomUUID()}`,
      transport: 'internal-simulated',
      reason,
    };
  }
}

class SurescriptsAdapter {
  constructor(config) {
    this.config = config;
  }

  ensureConfigured() {
    const { baseUrl, accountId, apiKey } = this.config;
    if (!baseUrl || !accountId || !apiKey) {
      throw new Error(
        'Surescripts is selected but not configured. Set SURESCRIPTS_BASE_URL, ' +
          'SURESCRIPTS_ACCOUNT_ID and SURESCRIPTS_API_KEY (requires certification).',
      );
    }
  }

  async transmit() {
    this.ensureConfigured();
    // Real implementation builds an NCPDP SCRIPT NewRx XML message and POSTs it
    // to the Surescripts endpoint. Intentionally not wired to a live endpoint
    // until certification is complete.
    throw new Error('Surescripts transmission requires completed certification and credentials.');
  }

  async cancel() {
    this.ensureConfigured();
    throw new Error('Surescripts cancellation requires completed certification and credentials.');
  }
}

function buildAdapter() {
  if (env.pharmacy.network === 'surescripts') {
    return new SurescriptsAdapter(env.pharmacy.surescripts);
  }
  return new InternalNetworkAdapter();
}

const adapter = buildAdapter();

export function transmitPrescription(prescription) {
  return adapter.transmit(prescription);
}

export function cancelPrescription(prescription, reason) {
  return adapter.cancel(prescription, reason);
}

export const activeNetwork = env.pharmacy.network;

export default { transmitPrescription, cancelPrescription, activeNetwork };
