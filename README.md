# ePrescribe — E-Prescribing Platform

A full-stack electronic prescribing application for physicians and medical
practices, in the spirit of DoseSpot, DrFirst, RXNT, and DrChrono. It provides
the core clinical and operational workflow of e-prescribing:

- **Authentication** — registration, JWT access/refresh tokens, **email
  verification**, password reset, rotating refresh tokens.
- **Role-based access control** — `admin`, `prescriber`, `nurse`, `staff`,
  `pharmacist`.
- **Patient management** — demographics, allergies, prescription history,
  practice-scoped data isolation.
- **Medication lookup** — live integration with the public **RxNorm (NIH/NLM)**
  drug database, plus a local catalog cache that works offline.
- **Prescription workflow** — draft → clinical safety review → electronic
  signature → transmission to pharmacy → cancellation, with a full status
  history.
- **Clinical decision support** — allergy checking (with drug-class
  cross-reactivity), duplicate-therapy detection, and drug-drug interaction
  screening. Critical alerts must be acknowledged with a reason before signing.
- **Controlled substances** — DEA schedule awareness; a DEA number is required
  to sign Schedule II–V prescriptions.
- **Pharmacy network adapter** — a pluggable transport with a working internal
  (simulated) implementation and a Surescripts adapter stub for when
  certification is complete.
- **Audit logging** — an append-only audit trail of every significant action,
  viewable by administrators.
- **EMR integration ready** — patients carry an `external_emr_id` for linking
  to a separate EMR system.

> ⚠️ **Compliance notice.** This is production-structured software, but
> e-prescribing in the United States is heavily regulated. Live transmission of
> prescriptions (especially controlled substances via EPCS) requires
> Surescripts certification, identity proofing, two-factor authentication for
> EPCS, a signed BAA for HIPAA, and more. **Do not use this with real patient
> data or for live prescribing until all legal and certification requirements
> are met.** See [`COMPLIANCE.md`](./COMPLIANCE.md).

---

## Architecture

```
eprescription/
├── backend/            Node.js + Express REST API
│   ├── src/
│   │   ├── config/     environment loading
│   │   ├── db/         Postgres pool, schema.sql, migrate, seed
│   │   ├── middleware/ auth, rbac, validation, error handling
│   │   ├── controllers/ request handlers
│   │   ├── routes/     route definitions
│   │   ├── services/   email, rxnorm, pharmacy network, clinical safety, audit
│   │   ├── validators/ Zod request schemas
│   │   └── utils/      crypto, tokens, helpers
│   └── Dockerfile
├── frontend/           React + Vite single-page app
│   ├── src/
│   │   ├── api/        fetch client with token refresh
│   │   ├── context/    auth context
│   │   ├── components/ layout
│   │   └── pages/      login, patients, prescriptions, admin, ...
│   └── Dockerfile (nginx)
└── docker-compose.yml  Postgres + API + web, one command to run
```

**Stack:** Node.js 22, Express, PostgreSQL 16, JWT (`jsonwebtoken`), `bcryptjs`,
Zod, Nodemailer, React 18, React Router, Vite.

---

## Quick start (Docker — recommended)

The fastest way to run the whole stack (database, API, and web UI):

```bash
cp .env.example .env            # optional: edit secrets
docker compose up --build
```

Then open **http://localhost:8080**.

The database is migrated and seeded automatically on first boot. Log in with a
demo account (see below). Verification emails are printed to the API container
logs in the default `stream` email mode (`docker compose logs -f api`).

## Quick start (local, without Docker)

**Prerequisites:** Node.js ≥ 20 and PostgreSQL ≥ 14.

```bash
# 1. Database
createdb eprescription   # or use the role/db of your choice

# 2. Backend
cd backend
cp .env.example .env      # set DATABASE_URL / PG* and JWT secrets
npm install
npm run db:reset          # creates schema + seeds demo data
npm run dev               # API on http://localhost:4000

# 3. Frontend (in a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev               # web on http://localhost:5173 (proxies /api to :4000)
```

### Demo accounts (password: `Password123!`)

| Email                          | Role        |
| ------------------------------ | ----------- |
| `admin@riverbend.health`       | admin       |
| `dr.smith@riverbend.health`    | prescriber  |
| `nurse.lee@riverbend.health`   | nurse       |

### Bootstrapping a real admin account

For a production deployment you typically skip the demo seed and create your own
verified admin instead:

```bash
cd backend
npm run create-admin -- \
  --email you@practice.com \
  --password "ChooseAStrongPassword123!" \
  --name "Jane Doe" \
  --practice "Your Medical Practice"   # [--role admin|prescriber|...]
```

The account is created **already verified and active**, so you can log in
immediately — no email step required. Re-running with the same email resets that
user's password and re-verifies it (idempotent). Values can also be supplied via
`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` / `ADMIN_PRACTICE` / `ADMIN_ROLE`.

### Skipping email verification during setup

If you don't have SMTP configured yet, set `AUTO_VERIFY_EMAIL=true` and new
self-service registrations are marked verified immediately (no verification
email sent), so users can sign up and log in right away. **Leave this `false` in
production** and configure real SMTP instead.

---

## Configuration

All backend configuration is via environment variables — see
[`backend/.env.example`](./backend/.env.example) for the full annotated list.
Key settings:

| Variable             | Purpose                                                        |
| -------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection string                                    |
| `JWT_*_SECRET`       | Signing secrets — **generate strong random values in prod**   |
| `EMAIL_TRANSPORT`    | `stream` (logs emails) or `smtp` (real delivery)              |
| `SMTP_*`             | SMTP credentials when `EMAIL_TRANSPORT=smtp`                  |
| `PHARMACY_NETWORK`   | `internal` (simulated) or `surescripts` (requires creds)      |
| `APP_PUBLIC_URL`     | Base URL used in verification / reset email links             |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Deploying as multiple services (`app.json`)

`app.json` declares the two services for a multi-service hosting platform:

```json
{
  "experimentalServices": {
    "frontend": { "root": "frontend", "routePrefix": "/", "framework": "vite" },
    "backend":  { "root": "backend",  "routePrefix": "/_/backend" }
  }
}
```

- The **frontend** (Vite) is served at `/`.
- The **backend** (Express) is served under the `/_/backend` route prefix and
  runs as a normal long-lived service (`npm start` → `src/server.js`).
- The SPA calls the API at `/_/backend/api/...`. The backend mounts its routes
  under **both** `/api` and `/_/backend/api`, so it works whether the platform
  strips the prefix before forwarding or passes the full path through.

**Set these environment variables for the backend service:**

| Variable | Value |
| -------- | ----- |
| `DATABASE_URL` | A managed Postgres connection string (Neon, Supabase, RDS…) |
| `PGSSL` | `true` (managed Postgres usually requires SSL) |
| `DB_POOL_MAX` | `5` (or lower if using a connection pooler) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_TOKEN_SECRET` | strong random secrets |
| `EMAIL_TRANSPORT` + `SMTP_*` | a real SMTP provider |
| `APP_PUBLIC_URL` | your deployed URL (used in email links) |
| `CORS_ORIGINS` | your deployed URL |

> **Database note.** Run the schema once against your database
> (`npm run db:migrate`, optionally `npm run db:seed`) before first use — the
> service does not run migrations on boot the way `docker compose` does. With
> Neon, run migrations against the **direct** (non-`-pooler`) endpoint and point
> the running app at the **pooled** endpoint.

### Migrating from GitHub (no local machine)

If you can't run the migration locally, use the included **“Database migrate”**
GitHub Actions workflow (`.github/workflows/db-migrate.yml`):

1. Add a repository secret `DATABASE_URL` (Settings → Secrets and variables →
   Actions) set to your Neon **direct** endpoint connection string.
2. Go to **Actions → Database migrate → Run workflow**. Optionally tick `seed`
   to load demo accounts, or fill `admin_email`/`admin_password` to create a
   verified admin in the same run.

The runner has outbound access to Neon, so this provisions the schema without
needing a local environment.

Docker Compose (`docker compose up --build`) remains fully supported for
self-hosting; nginx proxies both `/_/backend/` and `/api/` to the API.

## API overview

Base path: `/api`. All routes except `auth/*` (and `health`) require a
`Authorization: Bearer <accessToken>` header.

| Method | Endpoint                                 | Notes                              |
| ------ | ---------------------------------------- | ---------------------------------- |
| POST   | `/auth/register`                         | Creates user + sends verification  |
| POST   | `/auth/verify-email`                     | Confirms email with token          |
| POST   | `/auth/login`                            | Returns access + refresh tokens    |
| POST   | `/auth/refresh`                          | Rotates refresh token              |
| POST   | `/auth/forgot-password` / `/reset-password` | Password reset flow             |
| GET    | `/patients` · `/patients/:id`            | List / detail (with allergies)     |
| POST   | `/patients` · `PATCH /patients/:id`      | Create / update                    |
| POST   | `/patients/:id/allergies`                | Add allergy                        |
| GET    | `/medications/search?q=`                 | RxNorm + local search              |
| GET    | `/prescriptions` · `/prescriptions/:id`  | List / detail                      |
| POST   | `/prescriptions`                         | Create draft                       |
| GET    | `/prescriptions/:id/safety-check`        | Preview clinical alerts            |
| POST   | `/prescriptions/:id/sign`                | Sign (overrides for critical)      |
| POST   | `/prescriptions/:id/transmit`            | Send to pharmacy                   |
| POST   | `/prescriptions/:id/cancel`              | Cancel                             |
| GET    | `/pharmacies`                            | Search                             |
| GET    | `/users` · `PATCH /users/:id`            | Admin: manage users                |
| GET    | `/users/audit-logs`                      | Admin: audit trail                 |

---

## EMR integration

The platform is built to sit alongside a separate EMR. Patients carry an
`external_emr_id` (unique per practice) and prescriptions reference the practice
and prescriber, so the EMR can:

1. Create/sync patients via `POST /patients` with `externalEmrId`.
2. Launch a prescribing session for a patient and read back prescription status.
3. Subscribe to the audit log for reconciliation.

A token-based service account (a user with an appropriate role) is the
recommended integration path until a dedicated machine-to-machine OAuth flow is
added.

## License & status

Internal project. Not for clinical use until certified — see `COMPLIANCE.md`.
