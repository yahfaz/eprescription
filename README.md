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

## Deploying to Vercel

`vercel.json` configures Vercel to deploy both services from this monorepo:

- the **frontend** is built with Vite and served as static assets, and
- the **backend** Express app runs as a serverless function
  (`backend/api/index.js` exports the app; `app.listen` is only used for
  traditional hosting via `src/server.js`).

Routing: requests to `/api/*` go to the serverless API; everything else falls
back to the SPA's `index.html`.

**Before deploying, in the Vercel project settings → Environment Variables, set
at minimum:**

| Variable | Value |
| -------- | ----- |
| `DATABASE_URL` | A managed Postgres connection string (Neon, Supabase, RDS…) |
| `PGSSL` | `true` (managed Postgres usually requires SSL) |
| `DB_POOL_MAX` | `1`–`5` (serverless: one pool per instance) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_TOKEN_SECRET` | strong random secrets |
| `EMAIL_TRANSPORT` + `SMTP_*` | a real SMTP provider |
| `APP_PUBLIC_URL` | your deployed URL (used in email links) |
| `CORS_ORIGINS` | your deployed URL |

> **Database note.** Serverless functions are short-lived and scale
> horizontally, so use a Postgres provider with connection pooling (Neon /
> Supabase pooler / PgBouncer) and keep `DB_POOL_MAX` low. Run the schema once
> against your database (`npm run db:migrate`, optionally `db:seed`) before the
> first request — serverless functions do not run migrations on boot the way
> `docker compose` does.

```bash
npm i -g vercel
vercel            # preview deploy
vercel --prod     # production deploy
```

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
