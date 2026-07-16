# Feature Review & Roadmap — DoseSpot · DrFirst · Surescripts

A review of the capabilities offered by leading e-prescribing platforms and how
they map onto this application. Items are marked:

- ✅ **Implemented** — working in this app
- 🟡 **Simulated** — fully functional via an internal adapter; a real
  network/data source drops in behind the same interface once certified
- 🔒 **Roadmap (certification-gated)** — requires Surescripts certification,
  DEA/EPCS auditing, licensed clinical data, or a payer/PBM connection before it
  can be built for real use

## Platform capability landscape

**Surescripts** operates the national e-prescribing network and defines the
NCPDP SCRIPT transactions: NewRx, RxRenewal/RxRenewalRequest, RxChange,
RxTransfer, RxFill, CancelRx — plus Medication History, Real-Time Prescription
Benefit (RTPB), and Electronic Prior Authorization (ePA).

**DoseSpot** and **DrFirst (Rcopia)** are prescriber-facing platforms/APIs built
on that network, adding: Sig-Builder, medication favorites / order sets,
clinical decision support (allergy, drug–drug interaction, duplicate therapy),
EPCS with PDMP checks, RTPB / price transparency, ePA, and medication history.

## Feature matrix

| Feature | What it does | Status here |
| --- | --- | --- |
| e-Prescribing (NewRx) | Create, sign, and transmit a prescription to a pharmacy | ✅ / 🟡 transmit (internal network; Surescripts adapter stubbed) |
| Structured **Sig Builder** | Compose patient instructions from dose/route/frequency/PRN/duration | ✅ |
| **Medication favorites** | Per-prescriber quick-prescribe list that pre-fills drug + sig + qty | ✅ |
| **Real-Time Prescription Benefit** | Patient-specific formulary status, out-of-pocket cost, PA flag, lower-cost alternatives at point of care | 🟡 (internal estimator; Surescripts RTPB adapter-ready) |
| **Electronic Prior Authorization (ePA)** | Track/initiate PA status on a prescription | ✅ status workflow / 🔒 live payer ePA submission (CoverMyMeds/Surescripts) |
| **RxRenewal / renewal inbox** | Pharmacy-initiated refill authorization requests, approved into a new Rx | ✅ (inbox + approve→draft) / 🔒 real pharmacy-originated messages |
| **CancelRx** | Tell the pharmacy to discontinue a prescription | ✅ (internal) / 🔒 network CancelRx |
| Clinical decision support | Allergy (incl. class cross-reactivity), duplicate therapy, drug–drug interactions | ✅ (interactions via public RxNorm; licensed DB is the production upgrade) |
| **Medication history** | Aggregated fill history to inform prescribing | ✅ per-patient Rx history / 🔒 network+PBM aggregated history |
| Controlled substances awareness | DEA schedule flags; DEA number required to sign CII–CV | ✅ |
| **EPCS** (2-factor controlled-substance signing) | Identity-proofed, two-factor signing ceremony | 🔒 requires EPCS certification & audit |
| **PDMP** integration | State prescription-drug-monitoring lookups at prescribing | 🔒 requires state PDMP agreements |
| RxChange / RxTransfer / RxFill | Pharmacy questions, transfers, fill status | 🔒 network transactions |
| Formulary & Benefit file | Payer formulary/coverage reference data | 🟡 folded into RTPB estimate |
| Reporting / audit | Append-only audit log; admin audit viewer | ✅ |
| Role-based access, multi-practice | Prescriber/nurse/staff/admin/pharmacist; practice isolation | ✅ |

## What this PR added

- **Sig Builder** (`components/SigBuilder.jsx`) on the New Prescription screen.
- **Medication favorites** — `medication_favorites` table, `/api/favorites`
  CRUD, one-click prefill + "save as favorite" in the prescribing flow.
- **Real-Time Prescription Benefit** — `services/benefit.service.js` +
  `POST /api/prescriptions/benefit-check`, shown inline while prescribing
  (formulary tier, estimated cost, PA flag, cheaper alternatives).
- **ePA tracking** — `prior_auth_status`/`prior_auth_number` on prescriptions +
  `POST /api/prescriptions/:id/prior-auth`, with controls on the Rx detail page.
- **RxRenewal inbox** — `renewal_requests` table, `/api/renewals` (create / list
  / respond), and an **Inbox** page; approving creates a linked draft Rx.

> After deploying, re-run the **Database migrate** GitHub Action (or
> `npm run db:migrate`) so the new tables/columns are applied — the schema
> additions are idempotent.

## Not included yet (certification-gated)

EPCS two-factor signing, PDMP lookups, live Surescripts routing (NewRx/CancelRx/
RxChange/RxTransfer over the network), real payer ePA, and PBM-aggregated
medication history. Each is architected behind an adapter or status field so it
can be enabled once the corresponding certification/agreement is in place — see
`COMPLIANCE.md`.

## Sources

- [DoseSpot — Core ePrescribing](https://dosespot.com/core-eprescribing/)
- [DoseSpot — Adapting to Future Needs in E-Prescribing](https://dosespot.com/adapting-to-future-needs-in-e-prescribing-how-dosespot-leads-the-way/)
- [DrFirst — Rcopia e-Prescribing](https://drfirst.com/products/rcopia-eprescribing-physicians/)
- [DrFirst — Price Transparency](https://drfirst.com/price-transparency)
- [DrFirst — EPCS](https://drfirst.com/electronic-prescribing-for-controlled-substances)
- [Surescripts — E-Prescribing](https://surescripts.com/what-we-do/e-prescribing)
- [Surescripts — Electronic Prior Authorization](https://surescripts.com/what-we-do/electronic-prior-authorization)
- [Surescripts — Intelligent Prescribing (RTPB)](https://surescripts.com/what-we-do/intelligent-prescribing)
