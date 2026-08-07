# 🌱 Saple

Saple is a trust-focused company review, salary insight, benefits, and interview-experience platform built as a BUET CSE database project. The current milestone connects the Oracle model to an Express API and the existing responsive Vanilla JavaScript interface, with authenticated contributions and administrator review workflows.

## Current Implementation

| Layer | Available now |
| --- | --- |
| Oracle database | Tables, constraints, indexes, fictional sample data, privacy-safe public views, salary analytical views, and synchronized identity generators |
| Express backend | Public company data, account authentication, salary/review/interview writes, employee verification, reporting, ADMIN authorization, and transactional moderation |
| Frontend | Existing responsive design with live public data, account flows, contribution forms, verification requests, reporting, and an expanded ADMIN dashboard |
| Deferred | ML features and deployment automation |

## Core Features

- Searchable company directory, company profiles, benefits, and verified/community salary summaries
- Job-seeker and current/former-employee registration with BCrypt password hashing and signed JWT sessions
- Transactional salary, company-review, and interview-experience submissions
- Company-specific employee verification requests using company email metadata or a safe document reference
- ADMIN review of pending verification requests
- Approved-only public reviews and interview experiences with server-enforced anonymous display
- Authenticated reports with duplicate prevention, ADMIN triage, resolution, and dismissal
- ADMIN submission queue, subtype detail, approve/reject/flag controls, and immutable moderation history
- Atomic parent/child contribution inserts and atomic `SUBMISSIONS` plus `MODERATION_ACTIONS` writes
- Existing responsive design, accessible forms, and no frontend build step

## Trust, Privacy, and Publication

Every contribution retains its owner internally for authorization and moderation. Public review and interview responses expose an author name only when `is_anonymous = 0`; they never expose user IDs, email addresses, verification evidence, or moderation internals. Only `APPROVED` submissions are public.

Employee verification is company-specific. A later contribution is marked `VERIFIED` only when its employee has an active, non-expired `VERIFIED` request for that company. Evidence metadata is available only to ADMIN endpoints. The application does not store raw OTP values, uploaded document contents, national identifiers, or raw confidential files.

Reported approved content can be flagged or rejected using the same locked, audited moderation transaction. This immediately removes it from approved-only public reads. Report resolution remains a separate recorded ADMIN action.

## Salary Range Concepts

- **Verified Salary Range:** approved salary submissions whose verification status is `VERIFIED`.
- **Community Salary Range:** all approved salary submissions, verified or unverified.

Pending, rejected, and flagged salaries do not affect either public range.

## Technology Stack

- Oracle Database 19c
- Node.js, Express 5, and node-oracledb Thin mode
- BCrypt and JSON Web Tokens
- HTML5, CSS, and Vanilla JavaScript ES modules

## Quick Start

### 1. Prepare Oracle

Run these files as the intended schema owner:

```sql
@database/01_create_user.sql
@database/02_create_tables.sql
@database/03_insert_sample_data.sql
@database/04_test_queries.sql
```

`03_insert_sample_data.sql` commits its explicit fictional rows, then applies `START WITH LIMIT VALUE` to every identity populated with explicit sample IDs: `USERS`, `EMPLOYEES`, `COMPANIES`, `JOB_ROLES`, `BENEFITS`, `EMPLOYMENT_VERIFICATIONS`, `SUBMISSIONS`, `REPORTS`, and `MODERATION_ACTIONS`.

`01_create_user.sql` is empty. Use an existing Oracle user with the required object privileges. The cleanup block in `02_create_tables.sql` rebuilds Saple objects, so inspect it before running against data that must be retained.

### 2. Start the backend

From `backend/`:

```bash
npm install
```

Copy `.env.example` to `.env`, then set the Oracle connection and a long random `JWT_SECRET`:

```env
PORT=3000
DB_USER=SAPLE
DB_PASSWORD=your_local_password
DB_CONNECT_STRING=localhost:1521/ORCLPDB
DB_POOL_MIN=1
DB_POOL_MAX=5
DB_POOL_INCREMENT=1
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
```

```bash
npm run dev
```

### 3. Serve the frontend

From the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`; the API defaults to `http://localhost:3000`.

## API Overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health`, `/api/health/database` | Public | Process and Oracle health |
| GET | `/api/companies` | Public | List/search companies with `?search=` |
| GET | `/api/companies/:companyId` | Public | Company profile |
| GET | `/api/companies/:companyId/benefits` | Public | Company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Verified/community salary summaries |
| GET | `/api/companies/:companyId/reviews` | Public | Approved reviews and rating summary |
| GET | `/api/companies/:companyId/interviews` | Public | Approved interview experiences |
| POST | `/api/auth/register`, `/api/auth/login` | Public | Create/authenticate an account |
| GET | `/api/auth/me` | Bearer token | Current safe user profile |
| GET | `/api/job-roles` | Public | Controlled job-role choices |
| POST | `/api/companies/:companyId/salaries` | Bearer token | Pending salary contribution |
| POST | `/api/companies/:companyId/reviews` | Employee token | Pending company review |
| POST | `/api/companies/:companyId/interviews` | Bearer token | Pending interview experience |
| POST | `/api/companies/:companyId/verifications` | Employee token | Pending verification request |
| POST | `/api/submissions/:submissionId/reports` | Bearer token | Report a submission |
| GET/PATCH | `/api/admin/submissions/*` | ADMIN token | Queue, detail, decisions, and history |
| GET/PATCH | `/api/admin/verifications/*` | ADMIN token | Pending queue, detail, and decision |
| GET/PATCH | `/api/admin/reports/*` | ADMIN token | Report queue, detail, and status |

See [backend/README.md](backend/README.md) for contracts and transaction rules.

## Frontend Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage, search handoff, and trust model |
| `companies.html` | Live company directory and search |
| `company-details.html?id=<id>` | Profile, benefits, salary data, approved reviews/interviews, and reporting |
| `login.html`, `register.html` | Authentication and account creation |
| `submit-salary.html` | Authenticated salary contribution |
| `submit-review.html` | Employee company-review contribution |
| `interview-experience.html` | Authenticated interview contribution |
| `employee-verification.html` | Employee verification request |
| `admin.html` | Submission moderation, verification review, and report management |

See [frontend/README.md](frontend/README.md) for UI behavior and manual checks.

## Tests

From `backend/`:

```bash
npm test
npm run test:integration
```

The unit suite currently contains 34 passing tests. The live Oracle workflow covers authentication, all three contribution types, all identity generators, verification, ADMIN authorization, report handling, anonymous display, public publication rules, missing-resource contracts, salary aggregates, and forced rollback cases. Integration tests create uniquely named rows and clean them afterward; configure Oracle and `JWT_SECRET` first.

## Security Notes

- Never commit `.env`, Oracle credentials, JWT secrets, real proof material, or test passwords.
- Public registration cannot create an administrator.
- Password hashes and raw Oracle errors are never returned to clients.
- SQL is contained in repositories and uses bind variables.
- Protected requests recheck the current account status and role in Oracle; ADMIN routes do not rely on frontend hiding or a stale token role.
- Sample identities, companies, content, evidence references, and credentials are fictional.

## Deferred Scope

Real OTP delivery, uploaded document storage, ML/risk scoring, recommendation systems, advanced analytics, deployment, and production-grade session/password-recovery improvements are intentionally outside core completion.

## Presentation Demo

Use the end-to-end sequence in [docs/project_notes.md](docs/project_notes.md): browse a company, register/login, submit and moderate salary data, demonstrate company-specific verification, publish anonymous review/interview contributions, and resolve a report through audited target moderation. The same document lists recommended report screenshots.
