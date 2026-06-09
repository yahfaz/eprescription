-- ============================================================================
--  ePrescribe — PostgreSQL schema
--  E-prescribing platform for physicians and medical practices.
--  Designed to be HIPAA-conscious: audited, role-based, soft-delete aware.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive email

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'prescriber', 'nurse', 'staff', 'pharmacist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prescription_status AS ENUM (
    'draft', 'pending_review', 'signed', 'transmitted',
    'dispensed', 'cancelled', 'error', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE allergy_severity AS ENUM ('mild', 'moderate', 'severe', 'life_threatening');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sex_type AS ENUM ('male', 'female', 'other', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE email_token_purpose AS ENUM ('verify_email', 'password_reset');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Practices (organizations) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  npi           TEXT,                         -- organizational NPI
  phone         TEXT,
  fax           TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'US',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID REFERENCES practices(id) ON DELETE SET NULL,
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'staff',
  -- Prescriber-specific credentials (nullable for non-prescribers)
  npi             TEXT,                        -- individual National Provider Identifier
  dea_number      TEXT,                        -- DEA registration (controlled substances)
  state_license   TEXT,
  phone           TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_practice ON users(practice_id);

-- ─── Refresh tokens (rotating) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                  -- sha256 of the opaque token
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);

-- ─── Email tokens (verification + password reset) ──────────────────────────────
CREATE TABLE IF NOT EXISTS email_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     email_token_purpose NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);

-- ─── Patients ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  external_emr_id TEXT,                        -- link to the EMR record
  mrn             TEXT,                        -- medical record number
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  sex             sex_type NOT NULL DEFAULT 'unknown',
  phone           TEXT,
  email           CITEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  postal_code     TEXT,
  country         TEXT DEFAULT 'US',
  weight_kg       NUMERIC(6,2),
  height_cm       NUMERIC(6,2),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patients_practice ON patients(practice_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(practice_id, last_name, first_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_emr ON patients(practice_id, external_emr_id)
  WHERE external_emr_id IS NOT NULL;

-- ─── Patient allergies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_allergies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen     TEXT NOT NULL,                  -- free text or drug name
  rxnorm_cui   TEXT,                           -- when allergen is a drug
  reaction     TEXT,
  severity     allergy_severity NOT NULL DEFAULT 'moderate',
  onset_date   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_allergies_patient ON patient_allergies(patient_id);

-- ─── Medication catalog (RxNorm-backed cache) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rxnorm_cui     TEXT UNIQUE,                  -- RxNorm concept unique identifier
  name           TEXT NOT NULL,
  tty            TEXT,                          -- RxNorm term type (SCD, SBD, etc.)
  strength       TEXT,
  dose_form      TEXT,
  route          TEXT,
  ndc            TEXT,                          -- representative NDC
  -- DEA controlled substance schedule: 0 = not controlled, 2..5 = CII..CV
  dea_schedule   SMALLINT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medications_name ON medications(lower(name));

-- ─── Pharmacies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncpdp_id      TEXT,                          -- NCPDP / Surescripts pharmacy id
  npi           TEXT,
  name          TEXT NOT NULL,
  phone         TEXT,
  fax           TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  accepts_eprescribe BOOLEAN NOT NULL DEFAULT true,
  accepts_controlled BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharmacies_name ON pharmacies(lower(name));

-- ─── Prescriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id      UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  prescriber_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  medication_id    UUID NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
  pharmacy_id      UUID REFERENCES pharmacies(id) ON DELETE SET NULL,

  -- Sig / dosing instructions
  drug_name        TEXT NOT NULL,             -- denormalized snapshot at write time
  dea_schedule     SMALLINT NOT NULL DEFAULT 0,
  sig              TEXT NOT NULL,             -- patient instructions, e.g. "Take 1 tablet by mouth daily"
  quantity         NUMERIC(10,2) NOT NULL,
  quantity_unit    TEXT NOT NULL DEFAULT 'each',
  days_supply      INTEGER,
  refills          INTEGER NOT NULL DEFAULT 0,
  substitution_allowed BOOLEAN NOT NULL DEFAULT true,
  note_to_pharmacist TEXT,
  diagnosis_code   TEXT,                       -- ICD-10

  status           prescription_status NOT NULL DEFAULT 'draft',
  signed_at        TIMESTAMPTZ,
  signed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  transmitted_at   TIMESTAMPTZ,
  network_message_id TEXT,                     -- id returned by the pharmacy network
  cancel_reason    TEXT,
  written_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_on       DATE,

  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_practice ON prescriptions(practice_id);
CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_prescriber ON prescriptions(prescriber_id);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status);

-- ─── Prescription status history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  from_status      prescription_status,
  to_status        prescription_status NOT NULL,
  actor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  detail           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_events_rx ON prescription_events(prescription_id);

-- ─── Clinical safety checks recorded at sign time ──────────────────────────────
CREATE TABLE IF NOT EXISTS prescription_safety_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  check_type       TEXT NOT NULL,             -- 'allergy' | 'drug_interaction' | 'duplicate_therapy'
  severity         TEXT NOT NULL,             -- 'info' | 'warning' | 'critical'
  message          TEXT NOT NULL,
  overridden       BOOLEAN NOT NULL DEFAULT false,
  override_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_rx ON prescription_safety_checks(prescription_id);

-- ─── Audit log (append-only) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  practice_id  UUID REFERENCES practices(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,                 -- e.g. 'patient.create', 'rx.sign'
  entity_type  TEXT,                          -- 'patient', 'prescription', ...
  entity_id    TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_practice ON audit_logs(practice_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ─── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['practices','users','patients','prescriptions'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s;
       CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END $$;
