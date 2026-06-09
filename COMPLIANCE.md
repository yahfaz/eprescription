# Compliance & Certification Notes

This document summarizes the legal and certification requirements that must be
satisfied **before** this platform is used for live prescribing with real
patient data. It is informational, not legal advice — engage qualified
regulatory/legal counsel and the relevant certifying bodies.

## What this software already does

- Practice-scoped data isolation (multi-tenant by `practice_id`).
- Role-based access control and least-privilege route guards.
- Passwords hashed with bcrypt; tokens stored only as hashes.
- Email verification before account activation.
- Append-only audit logging of significant actions.
- Clinical decision support (allergy, duplicate therapy, interactions).
- DEA schedule awareness and a DEA-number requirement for controlled Rx signing.
- A pluggable pharmacy-network adapter that isolates real transmission.

## What must be completed before production / live use

### Surescripts certification
Routing prescriptions to pharmacies in the US goes through the Surescripts
network using the NCPDP SCRIPT standard. This requires:
- Surescripts onboarding and certification testing.
- A production account, endpoint credentials, and SPI/NCPDP identifiers.
- Implementation of the certified message set (NewRx, RxChange, CancelRx,
  RxRenewal, etc.). The `surescripts` adapter in `pharmacy.service.js` is where
  this is wired in.

### EPCS (Electronic Prescribing of Controlled Substances)
Controlled substances (DEA Schedules II–V) are governed by DEA rule 21 CFR
Part 1300+ and require:
- Identity proofing of prescribers (NIST IAL2/AAL2).
- Two-factor authentication at the moment of signing.
- A third-party EPCS audit/certification.
- Tamper-evident logging and access controls.

The current build enforces a DEA-number prerequisite but does **not** implement
the full EPCS two-factor signing ceremony — that must be added and certified.

### HIPAA
- Execute Business Associate Agreements (BAAs) with all vendors (hosting, email,
  drug database, Surescripts).
- Encryption in transit (TLS) and at rest (enable disk/DB encryption).
- Access logging and breach-notification procedures (audit log is a foundation).
- Workforce training, risk assessments, and policies/procedures.

### Drug knowledge base
Production allergy/interaction checking should use a licensed clinical drug
database (e.g., First Databank, Medi-Span, Elsevier) rather than the built-in
heuristic cross-reactivity map. RxNorm provides terminology but not full
clinical screening.

### Other
- Penetration testing and a formal security review.
- Data retention and disposal policies.
- State-specific e-prescribing mandates and PDMP integration where required.

## Production hardening checklist (technical)

- [ ] Replace all default `JWT_*` / `EMAIL_TOKEN_SECRET` values with strong secrets.
- [ ] Set `EMAIL_TRANSPORT=smtp` with a real, BAA-covered provider.
- [ ] Terminate TLS in front of the API and web (reverse proxy / load balancer).
- [ ] Enable Postgres SSL (`PGSSL=true`) and encryption at rest.
- [ ] Restrict `CORS_ORIGINS` to known frontends.
- [ ] Add automated backups and disaster recovery.
- [ ] Add MFA for all users; EPCS-grade MFA for controlled-substance signers.
- [ ] Integrate a licensed drug database and Surescripts.
