import pool, { query, withTransaction } from './pool.js';
import { hashPassword } from '../utils/crypto.js';

/**
 * Seeds a demo practice with verified users, a medication catalog (with DEA
 * schedules), pharmacies, and sample patients so the app is immediately usable.
 * Idempotent: safe to run repeatedly.
 */

const MEDICATIONS = [
  { cui: '617314', name: 'Atorvastatin 20 MG Oral Tablet', tty: 'SCD', strength: '20 mg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '197361', name: 'Amlodipine 5 MG Oral Tablet', tty: 'SCD', strength: '5 mg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '311036', name: 'Lisinopril 10 MG Oral Tablet', tty: 'SCD', strength: '10 mg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '860975', name: 'Metformin 500 MG Oral Tablet', tty: 'SCD', strength: '500 mg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '849574', name: 'Amoxicillin 500 MG Oral Capsule', tty: 'SCD', strength: '500 mg', form: 'Capsule', route: 'oral', schedule: 0 },
  { cui: '198211', name: 'Azithromycin 250 MG Oral Tablet', tty: 'SCD', strength: '250 mg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '197696', name: 'Levothyroxine 0.05 MG Oral Tablet', tty: 'SCD', strength: '50 mcg', form: 'Tablet', route: 'oral', schedule: 0 },
  { cui: '856980', name: 'Omeprazole 20 MG Delayed Release Oral Capsule', tty: 'SCD', strength: '20 mg', form: 'Capsule', route: 'oral', schedule: 0 },
  { cui: '1049221', name: 'Acetaminophen 325 MG / Oxycodone 5 MG Oral Tablet', tty: 'SCD', strength: '325/5 mg', form: 'Tablet', route: 'oral', schedule: 2 },
  { cui: '1190795', name: 'Alprazolam 0.5 MG Oral Tablet', tty: 'SCD', strength: '0.5 mg', form: 'Tablet', route: 'oral', schedule: 4 },
];

const PHARMACIES = [
  { ncpdp: '1234567', name: 'CVS Pharmacy #4821', phone: '617-555-0142', city: 'Boston', state: 'MA', zip: '02115', controlled: true },
  { ncpdp: '7654321', name: 'Walgreens #1107', phone: '617-555-0199', city: 'Cambridge', state: 'MA', zip: '02139', controlled: true },
  { ncpdp: '2468013', name: 'Community Care Compounding', phone: '617-555-0123', city: 'Somerville', state: 'MA', zip: '02143', controlled: false },
];

async function seed() {
  // Idempotent: skip if the demo practice already exists (safe on container restarts)
  const existing = await query("SELECT 1 FROM practices WHERE name = 'Riverbend Family Medicine' LIMIT 1");
  if (existing.rowCount > 0) {
    // eslint-disable-next-line no-console
    console.log('Seed skipped — demo data already present.');
    await pool.end();
    return;
  }

  await withTransaction(async (client) => {
    // Practice
    const { rows: practiceRows } = await client.query(
      `INSERT INTO practices (name, npi, phone, address_line1, city, state, postal_code)
       VALUES ('Riverbend Family Medicine', '1639171717', '617-555-0100', '500 Harrison Ave', 'Boston', 'MA', '02118')
       RETURNING id`,
    );
    const practiceId = practiceRows[0].id;

    // Users (all pre-verified for demo convenience)
    const adminHash = await hashPassword('Password123!');
    const users = [
      ['admin@riverbend.health', 'Dana', 'Admin', 'admin', null, null],
      ['dr.smith@riverbend.health', 'Olivia', 'Smith', 'prescriber', '1972654837', 'BS1234567'],
      ['nurse.lee@riverbend.health', 'Marcus', 'Lee', 'nurse', null, null],
    ];
    const userIds = {};
    for (const [email, first, last, role, npi, dea] of users) {
      const { rows } = await client.query(
        `INSERT INTO users (practice_id, email, password_hash, first_name, last_name, role, npi, dea_number, email_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
        [practiceId, email, adminHash, first, last, role, npi, dea],
      );
      userIds[email] = rows[0].id;
    }

    // Medications
    for (const m of MEDICATIONS) {
      await client.query(
        `INSERT INTO medications (rxnorm_cui, name, tty, strength, dose_form, route, dea_schedule)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (rxnorm_cui) DO NOTHING`,
        [m.cui, m.name, m.tty, m.strength, m.form, m.route, m.schedule],
      );
    }

    // Pharmacies
    for (const p of PHARMACIES) {
      await client.query(
        `INSERT INTO pharmacies (ncpdp_id, name, phone, city, state, postal_code, accepts_controlled)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.ncpdp, p.name, p.phone, p.city, p.state, p.zip, p.controlled],
      );
    }

    // Patients
    const patients = [
      ['John', 'Doe', '1979-04-12', 'male', 'MRN1001', 'penicillin', 'severe', 'Hives and difficulty breathing'],
      ['Maria', 'Garcia', '1985-11-30', 'female', 'MRN1002', null, null, null],
      ['Robert', 'Chen', '1962-02-08', 'male', 'MRN1003', 'sulfa drugs', 'moderate', 'Rash'],
    ];
    for (const [first, last, dob, sex, mrn, allergen, severity, reaction] of patients) {
      const { rows } = await client.query(
        `INSERT INTO patients (practice_id, mrn, first_name, last_name, date_of_birth, sex, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [practiceId, mrn, first, last, dob, sex, userIds['admin@riverbend.health']],
      );
      if (allergen) {
        await client.query(
          `INSERT INTO patient_allergies (patient_id, allergen, severity, reaction)
           VALUES ($1,$2,$3,$4)`,
          [rows[0].id, allergen, severity, reaction],
        );
      }
    }
  });

  const { rows } = await query('SELECT email, role FROM users ORDER BY role');
  // eslint-disable-next-line no-console
  console.log('✓ Seed complete. Demo accounts (password: Password123!):');
  rows.forEach((r) => console.log(`   - ${r.email} (${r.role})`)); // eslint-disable-line no-console
  await pool.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
