# 🌱 Saple

Saple is a trust-focused company review, salary insight, benefits, and interview-experience platform built as a BUET CSE database project. The current milestone provides public approved-data browsing, company-specific verified-employee contributions, account/profile management, and administrator review workflows through Oracle, Express, and the existing responsive Vanilla JavaScript interface.

## Current Implementation

| Layer | Available now |
| --- | --- |
| Oracle database | Tables, constraints, indexes, role-scoped verification, 54 scripted company references, dense guarded synthetic demo content, analytical queries, and synchronized identity generators |
| Express backend | Public company/salary/review/interview queries, approved-review ratings, account/profile APIs, SMTP password recovery, exact company-role contribution policy, reporting, and transactional ADMIN workflows |
| Frontend | Responsive sidebar Browse pages, rating headers, email password recovery, verified-scope Contribute forms, profile/security controls, verification requests, reporting, the homepage tree, and ADMIN dashboard |
| Optional ML | Standalone minimal moderation-risk prototype implemented; runtime/backend/admin integration remains deferred |

## Core Features

- Public company, salary, review, and interview directories with approved-only Oracle queries
- Company filtering by name, industry, approved-data job role, salary range/source, location, size, rating, and data availability
- 50 real employer references (35 Bangladesh-focused and 15 international) with documented official sources, plus 55 additional cross-industry roles
- Job-seeker and current/former-employee registration with BCrypt password hashing and signed JWT sessions
- Exact company-and-designation verified-employee-only salary, review, and interview submissions, enforced by middleware and the write transaction
- Safe profile name editing, read-only email, and current-password-protected password changes
- Temporary single-use email password resets with SHA-256 token storage and BCrypt password replacement
- Company-and-designation employee verification requests using company email metadata or a safe document reference
- ADMIN review of pending verification requests
- Approved-only public reviews and interview experiences with server-enforced anonymous display
- Authenticated reports with duplicate prevention, ADMIN triage, resolution, and dismissal
- ADMIN submission queue, subtype detail, approve/reject/flag controls, and immutable moderation history
- Atomic parent/child contribution inserts and atomic `SUBMISSIONS` plus `MODERATION_ACTIONS` writes
- Existing responsive design, accessible forms, and no frontend build step

## Trust, Privacy, and Publication

Every contribution retains its owner internally for authorization and moderation. Public review and interview responses expose an author name only when `is_anonymous = 0`; they never expose user IDs, email addresses, verification evidence, or moderation internals. Only `APPROVED` submissions are public.

Employee verification is scoped to an exact employee, company, and job role. Salary, review, and interview POST requests require an active account and a non-expired `VERIFIED` row matching both submitted IDs; ADMIN status grants no contribution access by itself. The authoritative check and insert use the same Oracle connection and transaction. Legacy verification rows whose role could not be inferred safely remain nullable and cannot authorize new contributions. Evidence metadata is available only to ADMIN endpoints.

Reported approved content can be flagged or rejected using the same locked, audited moderation transaction. This immediately removes it from approved-only public reads. Report resolution remains a separate recorded ADMIN action.

## Salary Range Concepts

- **Verified Salary Range:** approved salary submissions whose verification status is `VERIFIED`.
- **Community Salary Range:** all approved salary submissions, verified or unverified.

Pending, rejected, and flagged salaries do not affect either public range.

## Technology Stack

- Oracle Database 19c
- Node.js, Express 5, and node-oracledb Thin mode
- BCrypt and JSON Web Tokens
- Nodemailer SMTP delivery
- HTML5, CSS, inline SVG, and Vanilla JavaScript ES modules

## Quick Start

### 1. Prepare Oracle

Run these files as the intended schema owner:

```sql
@database/01_create_user.sql
@database/02_create_tables.sql
@database/03_insert_sample_data.sql
@database/05_expand_reference_data.sql
@database/06_create_password_reset_tokens.sql
@database/07_add_role_scoped_verification.sql
@database/08_seed_demo_salary_reviews.sql
@database/04_test_queries.sql
```

`03_insert_sample_data.sql` commits its explicit fictional rows, then applies `START WITH LIMIT VALUE` to every identity populated with explicit sample IDs: `USERS`, `EMPLOYEES`, `COMPANIES`, `JOB_ROLES`, `BENEFITS`, `EMPLOYMENT_VERIFICATIONS`, `SUBMISSIONS`, `REPORTS`, and `MODERATION_ACTIONS`.

`05_expand_reference_data.sql` is additive and repeatable. It uses case-insensitive `MERGE` operations to add 50 real employer reference rows and 55 roles without deleting developer data or duplicating names. Company provenance is documented in [database/company_seed_sources.md](database/company_seed_sources.md); no third-party salary, review, or interview data is seeded.

`06_create_password_reset_tokens.sql` was the one-time additive password-recovery migration. It stores only unique SHA-256 token hashes and creates the user/state lookup index; it is already present in the current populated database.

For the current existing populated database, migration `06` is already completed. Apply only this exact next order:

```sql
@database/07_add_role_scoped_verification.sql
@database/08_seed_demo_salary_reviews.sql
```

Do not rerun `02` or `06`. Migration `07` adds nullable `ROLE_ID`, safely backfills only unambiguous legacy rows, and leaves unresolved rows unauthorized. Seed `08` is rerunnable and adds clearly marked synthetic academic salaries and reviews without deleting or duplicating existing data. Its salary figures are fictional, not official company data, and are not trustworthy ML training data.

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
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=replace_with_smtp_username
SMTP_PASS=replace_with_smtp_password
SMTP_FROM=Saple <no-reply@example.com>
FRONTEND_URL=http://localhost:5500/
PASSWORD_RESET_TOKEN_TTL_MINUTES=15
```

For Gmail SMTP, enable two-step verification and create an App Password; use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`, the Google account as `SMTP_USER`, and the App Password as `SMTP_PASS`. Port `465` normally uses `SMTP_SECURE=true`. Other SMTP providers work with their corresponding host, port, security, and credentials. Put credentials only in ignored `backend/.env`, never in source or documentation.

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
| GET | `/api/companies` | Public | Advanced company search and aggregate filters |
| GET | `/api/companies/filter-options` | Public | Distinct industry/location/size options |
| GET | `/api/companies/:companyId` | Public | Company profile |
| GET | `/api/companies/:companyId/benefits` | Public | Company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Verified/community salary summaries |
| GET | `/api/companies/:companyId/reviews` | Public | Approved reviews and rating summary |
| GET | `/api/companies/:companyId/interviews` | Public | Approved interview experiences |
| GET | `/api/salaries` | Public | Approved verified/community salary aggregates |
| GET | `/api/reviews` | Public | Approved reviews across companies |
| GET | `/api/interviews` | Public | Approved interviews across companies |
| POST | `/api/auth/register`, `/api/auth/login` | Public | Create/authenticate an account |
| POST | `/api/auth/forgot-password` | Public, rate-limited | Send a temporary reset link through configured SMTP |
| POST | `/api/auth/reset-password` | Public, rate-limited | Consume a reset token and atomically replace the password |
| GET | `/api/auth/me` | Bearer token | Current safe user profile |
| PATCH | `/api/auth/me` | Bearer token | Change full name only |
| PATCH | `/api/auth/me/password` | Bearer token | Change password after current-password check |
| GET | `/api/job-roles` | Public | Controlled job-role choices |
| POST | `/api/companies/:companyId/salaries` | Verified exact company-role scope | Pending salary contribution |
| POST | `/api/companies/:companyId/reviews` | Verified exact company-role scope | Pending company review |
| POST | `/api/companies/:companyId/interviews` | Verified exact company-role scope | Pending interview experience |
| POST | `/api/companies/:companyId/verifications` | Employee token | Pending company-role verification request |
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
| `salaries.html` | Public approved salary aggregates and filters |
| `reviews.html` | Public approved workplace reviews and filters |
| `interviews.html` | Public approved interview experiences and filters |
| `faq.html`, `about.html` | Accessible project guidance, privacy boundaries, methodology, and academic disclaimer |
| `company-details.html?id=<id>` | Profile, benefits, salary data, approved reviews/interviews, and reporting |
| `login.html`, `register.html` | Authentication and account creation |
| `forgot-password.html`, `reset-password.html` | Temporary email password-reset request and completion |
| `profile.html` | Safe profile view, name edit, verified company-role scopes, and password change |
| `submit-salary.html`, `submit-review.html`, `interview-experience.html` | Verified-employee-only contribution forms |
| `employee-verification.html` | Employee verification request |
| `admin.html` | Submission moderation, verification review, and report management |

See [frontend/README.md](frontend/README.md) for UI behavior and manual checks.

## Tests

From `backend/`:

```bash
npm test
npm run test:integration
```

The unit suite currently contains 94 tests, including focused coverage for exact company-role authorization, ADMIN independence, transaction rollback, migration/seed structure, safe verified-scope responses, approved rating queries, and responsive filter layouts, alongside all prior authentication, recovery, moderation, privacy, tree, FAQ, and navigation tests.

To test recovery locally, do not rerun migration `06`: configure SMTP and `FRONTEND_URL`, restart the backend, call a clearly unknown address and confirm the exact `404` response, then request a link for an active account. Confirm SMTP acceptance, a 64-character database hash, old-password failure, new-password success, one-time use, expiry handling, and rollback on SMTP failure. Never paste a reset link into logs or issue trackers. Detailed unknown-email responses are an academic requirement; production systems normally use a generic response to reduce account enumeration.

## Security Notes

- Never commit `.env`, Oracle credentials, JWT secrets, real proof material, or test passwords.
- Public registration cannot create an administrator.
- Password hashes and raw Oracle errors are never returned to clients.
- SQL is contained in repositories and uses bind variables.
- Protected requests recheck the current account status and role in Oracle; ADMIN routes do not rely on frontend hiding or a stale token role.
- Sample identities, companies, content, evidence references, and credentials are fictional.
- Detailed unknown-email and incorrect-password messages are included for this academic requirement, but they permit account enumeration. Production systems normally use one generic authentication/recovery response.
- JWT access tokens are stateless. A password reset changes the stored password but cannot immediately revoke an already issued JWT without a token-version or deny-list design.
- The reset limiter is in process memory; production deployment across multiple instances would require a shared rate-limit store.

## Deferred Scope

Real employment-verification OTP delivery, uploaded document storage, runtime/backend/admin integration of ML scores, recommendation systems, advanced analytics, deployment, production-grade session revocation, shared rate limiting, and email-delivery monitoring are intentionally outside core completion. The standalone minimal ML prototype is implemented as decision support only. It stays inactive for a role below 50 final moderator-reviewed historical records, excludes synthetic demonstration data as trustworthy evidence, and never replaces the human moderator.

## Presentation Demo

Use the end-to-end sequence in [docs/project_notes.md](docs/project_notes.md): browse a company, register/login, submit and moderate salary data, demonstrate company-specific verification, publish anonymous review/interview contributions, and resolve a report through audited target moderation. The same document lists recommended report screenshots.
