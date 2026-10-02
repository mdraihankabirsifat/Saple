# Saple Backend

The Saple backend connects Express 5 to Supabase-hosted PostgreSQL through the `pg` driver and raw SQL. It provides public approved company/salary/review/interview browsing, JWT authentication, Resend HTTPS password recovery, safe profile changes, exact company-and-designation verified contributions, reporting, and ADMIN workflows with immutable submission-moderation history.

## Database objects and transactions

Every runtime `INSERT`, `UPDATE` and `DELETE` runs inside an explicit
transaction. Multi-step workflows open their own with `getClient()`, `BEGIN`,
`COMMIT` and `ROLLBACK`; single-statement writes use
`database.withTransaction(work)`, which does the same and releases the client.
Passing an existing client makes the work join the caller's transaction instead
of opening a second one.

PostgreSQL also carries three objects of its own, installed by
`database/postgres/migrations/005_cse216_final_database_features.sql` and by the
fresh schema:

| Object | Kind | Used by |
|---|---|---|
| `saple_set_updated_at()` + `trg_*_set_updated_at` | trigger function and 7 triggers | every `UPDATE` on a table with `updated_at` |
| `saple_company_insight_summary(company_id)` | `STABLE` function | `company.repository.js` → `GET /api/companies/:id` (`insights`) |
| `saple_apply_application_decision(...)` | procedure | `application.repository.js` → `changeApplicationStatus()` |

The procedure never commits: the repository owns the transaction so the
applicant's notification commits with the decision. Full mapping in
[`../docs/cse216-final-compliance.md`](../docs/cse216-final-compliance.md).

## Prerequisites and Setup

See [../docs/supabase_setup.md](../docs/supabase_setup.md) for the full Supabase walkthrough.

- Node.js 18 or newer and npm
- A Supabase project with the Saple PostgreSQL scripts applied
- A server-side Supabase PostgreSQL connection string

The browser never connects to Supabase directly; Express remains the security boundary.

```bash
npm install
```

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
DATABASE_URL=postgresql://postgres.project_ref:your_password@your_pooler_host:5432/postgres
DB_SSL=true
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=10000
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=replace_with_smtp_username
SMTP_PASS=replace_with_smtp_password
SMTP_FROM=Saple <no-reply@example.com>
RESEND_API_KEY=replace_with_resend_api_key
RESEND_FROM_EMAIL=Saple <no-reply@example.com>
FRONTEND_URL=http://localhost:5500/
PASSWORD_RESET_TOKEN_TTL_MINUTES=15
```

Password-reset delivery uses the Resend HTTPS API. Set `RESEND_API_KEY` as a server-side secret and `RESEND_FROM_EMAIL` to a sender identity verified in Resend. Legacy SMTP settings remain for the local diagnostic. Never commit `backend/.env`.

For a completely fresh Supabase project, execute the PostgreSQL files in this order:

```sql
database/postgres/01_final_schema_postgres.sql
database/postgres/02_final_demo_data_postgres.sql
database/postgres/03_schema_and_data_demo_postgres.sql
```

Run the third PostgreSQL file at any time for read-only validation.

```bash
npm run dev
# or: npm start
```

The PostgreSQL pool initializes before HTTP listening. The default local address is `http://localhost:3000`. Express also serves the existing `frontend/` directory for one-origin hosting; see [../docs/deployment.md](../docs/deployment.md).

## Demo-day offline database fallback

Keep `DB_FALLBACK_ENABLED=false` on Render. For a local demo, stop the full
Docker app if it occupies port 3000, then start only its persistent PostgreSQL:

```bash
cd backend
npm run local:down
npm run local:db-up
```

`local:db-up` creates `../.env.local` with a random database password if it
does not exist. In `backend/.env`, keep `DATABASE_URL` pointing to Supabase,
then set `DB_FALLBACK_ENABLED=true`, `LOCAL_DB_SSL=false`, and set
`LOCAL_DATABASE_URL` to
`postgresql://saple_local:<SAPLE_LOCAL_DB_PASSWORD from ../.env.local>@127.0.0.1:5433/saple_local`.
The generated password is hex, so it needs no URL escaping. Start with
`npm start`. The backend tests Supabase first. On a network connection failure,
it switches once to the independent local database and stays there until the
process restarts. There is no synchronization of local writes back to Supabase.
Restart the backend while online to prefer Supabase again. Check
`http://localhost:3000/api/health/database` for `data.source` (`supabase` or
`local`). `npm run local:db-down` stops the local database without deleting its
volume. If both databases are unreachable, startup fails clearly. A crashed
Node process still needs restarting.

For an existing local database created before these features, run migrations
001–007 in order against it. The local database created by a fresh
`local:db-up` installation already includes the current schema. Do not delete
the local Docker volume just to update its schema.

## Profile images and direct messages

Existing Supabase projects need
`database/postgres/migrations/006_profile_and_company_images.sql` and
`007_direct_messages.sql`, in that order, in the Supabase SQL Editor. Both are
additive. Configure backend-only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`SUPABASE_AVATAR_BUCKET=avatar`, and
`SUPABASE_COMPANY_LOGO_BUCKET=Company_logos`. The two Storage buckets must be
public. Saple accepts JPEG, PNG or WebP only (2 MB avatars, 1 MB logos) and
stores only the object path in PostgreSQL. Browsing works without Storage
configuration; uploads return 503. Direct messages use cloud PostgreSQL only:
when the backend has switched to the local database, messaging returns 503
and no local messages are written. The browser never caches message API data.

## Endpoint Reference

Successful responses use `{ "success": true, "message": "...", "data": ... }`. Errors expose a safe application message, not raw PostgreSQL details.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | Static Saple homepage |
| GET | `/api` | Public | API welcome |
| GET | `/api/health` | Public | Express health |
| GET | `/api/health/database` | Public | PostgreSQL health and active source (`supabase` or `local`) |
| PUT / DELETE | `/api/me/avatar` | Signed-in user | Change or remove own profile picture |
| PUT / DELETE | `/api/representative/companies/:companyId/logo` | Active representative for that company | Change or remove company logo |
| GET | `/api/users/:userId/profile` | Signed-in user | Minimal safe member profile |
| GET / POST | `/api/messages/with/:userId` | Signed-in user, cloud database | Read or send direct messages |
| PATCH / DELETE | `/api/messages/:messageId` | Original sender, cloud database | Edit or soft-delete a message |
| GET | `/api/messages/conversations`, `/api/messages/unread-count` | Signed-in user, cloud database | Recent conversations and unread count |
| GET | `/api/messages/company/:companyId/contacts` | Signed-in user, cloud database | Active representative contacts without email |
| GET | `/api/companies` | Public | Filter companies and approved-data aggregates |
| GET | `/api/companies/filter-options` | Public | Distinct industry, location, and size choices |
| GET | `/api/companies/:companyId` | Public | Company detail |
| GET | `/api/companies/:companyId/benefits` | Public | Company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Verified/community salary summaries |
| GET | `/api/companies/:companyId/reviews` | Public | Approved reviews and rating aggregates |
| GET | `/api/companies/:companyId/interviews` | Public | Approved interview experiences |
| GET | `/api/salaries` | Public | Approved salary aggregates across companies |
| GET | `/api/reviews` | Public | Approved reviews across companies |
| GET | `/api/interviews` | Public | Approved interview experiences across companies |
| POST | `/api/companies/:companyId/interviews` | Verified exact company-role scope | Create a pending interview experience |
| POST | `/api/companies/:companyId/verifications` | Employee token | Request company-role verification |
| GET | `/api/job-roles` | Public | Controlled job-role values |
| POST | `/api/auth/register` | Public | Create a `NORMAL` or `EMPLOYEE` account |
| POST | `/api/auth/login` | Public | Return JWT and safe user object |
| POST | `/api/auth/logout` | Bearer token | Increment token version and revoke the current JWT |
| POST | `/api/auth/forgot-password` | Public, rate-limited | Email a temporary password-reset link |
| POST | `/api/auth/reset-password` | Public, rate-limited | Atomically consume a token and update the password |
| GET | `/api/auth/me` | Bearer token | Current safe user profile |
| GET | `/api/auth/me/submissions` | Bearer token | Current user's private contribution list |
| GET | `/api/auth/me/submissions/:submissionId` | Owner token | Owner-only private contribution detail |
| PATCH | `/api/auth/me` | Bearer token | Change full name only |
| POST | `/api/companies/:companyId/salaries` | Verified exact company-role scope | Create a pending salary contribution |
| POST | `/api/companies/:companyId/reviews` | Verified exact company-role scope | Create a pending review |
| POST | `/api/submissions/:submissionId/reports` | Bearer token | Create one report per user/submission |
| GET | `/api/admin/submissions/pending` | ADMIN token | Pending queue, oldest first |
| GET | `/api/admin/submissions/:submissionId` | ADMIN token | Parent and subtype detail |
| PATCH | `/api/admin/submissions/:submissionId/status` | ADMIN token | Audited approve/reject/flag transition |
| GET | `/api/admin/submissions/:submissionId/moderation-history` | ADMIN token | Chronological immutable actions |
| GET | `/api/admin/verifications/pending` | ADMIN token | Pending verification queue |
| GET | `/api/admin/verifications/:verificationId` | ADMIN token | Verification detail including evidence metadata |
| PATCH | `/api/admin/verifications/:verificationId/status` | ADMIN token | Verify or reject request |
| GET | `/api/admin/reports` | ADMIN token | Report queue and resolved history |
| GET | `/api/admin/reports/:reportId` | ADMIN token | Report detail |
| PATCH | `/api/admin/reports/:reportId/status` | ADMIN token | Review, resolve, or dismiss report |

## Authentication

Registration lowercases email, rejects duplicates with `409`, hashes passwords with BCrypt (12 rounds), and atomically creates an `EMPLOYEES` child for employee accounts. Employee registration requires `employmentStatus` of `CURRENT` or `FORMER`. Public input never accepts `account_role`.

Login returns a minimal HS256 JWT with `userId`, `role`, and `tokenVersion`. Issuer, audience, algorithm, and expiration are verified. Every protected request reloads current `account_status`, `account_role`, and `token_version`, so suspension, role changes, and revocation take effect immediately.

```text
Authorization: Bearer <token>
```

`GET /api/auth/me` returns active, non-expired exact scopes as `verifiedScopes`, containing only `companyId`, `companyName`, `roleId`, `roleName`, and `expiresAt`. It never exposes employee IDs, evidence, reviewer data, or internal references. Profile updates accept only `fullName`; email, account type, role, account status, employment status, and verification state cannot be changed there.

### Password recovery

`POST /api/auth/forgot-password` normalizes the email, checks account status, generates 32 cryptographically random bytes, stores only their SHA-256 hash, and sends the raw value only inside the temporary email link. Existing active tokens are revoked in the same PostgreSQL transaction. SMTP delivery runs before commit; delivery failure rolls back both the new token and revocation changes and returns a controlled `503`.

Live diagnosis must start the actual backend and call the route directly. An unknown valid email returns `404`, `success: false`, and exactly `No account was found with that email address.` without inserting a token. For a real account, verify provider acceptance, a 64-character stored hash, one-time reset behavior, and rollback under an invalid SMTP configuration. Required local names are `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `FRONTEND_URL`; never print their values. The detailed unknown-email response is an academic choice and should normally be generic in production.

`POST /api/auth/reset-password` accepts `token`, `newPassword`, and `confirmPassword`. It enforces the existing 8-to-72-byte letter-and-number policy, locks the matching hash row, rejects expired/used/revoked tokens, updates the BCrypt hash, marks the token used, revokes other tokens, and commits once. The raw token is never returned or logged. The default expiry is 15 minutes.

Both recovery endpoints use an in-memory IP/request-key limiter. This is suitable for the single-process academic deployment; multi-instance production deployment needs a shared rate-limit store. Detailed account-existence responses enable enumeration and are present only because the project requirements explicitly request them. A production service normally returns generic login and recovery messages.

Saple signs short-lived access JWTs and stores no refresh tokens. Every protected request reloads the current database role, status, and `token_version`. Logout, password change, and password reset increment that version, immediately invalidating older JWTs.

## Public Browse Queries

The top-level `GET /api/salaries`, `/api/reviews`, and `/api/interviews` endpoints require no token and select approved rows only. They support bound company/role/location filters; salaries add range and `COMMUNITY|VERIFIED` source filters, reviews add minimum rating, and interviews add difficulty/mode. Public company filtering uses PostgreSQL CTEs, `LEFT JOIN`, `EXISTS`, `GROUP BY`, aggregates, and bound predicates for name, industry, role, location, salary source/range, size, rating, and available-data flags.

## Transactional Contributions

Salary, review, and interview repositories each use one checked-out PostgreSQL client:

```text
validate active exact employee + company + role verification + references
                    |
                    v
insert SUBMISSIONS parent as PENDING
                    |
                    v
insert subtype child with returned submission_id
                    |
                    v
                  COMMIT
```

Any error rolls back the whole unit, preventing orphan parents. All values are validated in services and bound in repository SQL.

### Salary input

The salary body contains `roleId`, positive `baseSalary`, optional nonnegative `additionalCompensation`, three-letter uppercase `currency`, `MONTHLY|YEARLY` pay period, experience from `0` to `60`, controlled employment/work-mode values, salary year `2000`-`2100`, and boolean `isAnonymous`.

### Review input

Reviews require an active employee account whose profile status matches the supplied `CURRENT|FORMER` value. They include an optional role, title, five ratings from `1` to `5` with at most one decimal, pros, cons, optional advice, a nonfuture review date, and boolean anonymity.

### Interview input

Interview experiences require a company-verified employee. They include a role, nonfuture date, difficulty, `1`-`20` rounds, mode, result, duration `0`-`365` days, process description, optional question summary, and boolean anonymity.

All three contribution routes and repositories require a matching active, non-expired company verification. Missing verification returns `403`; accepted contributions are marked `VERIFIED` and remain `PENDING` until moderation. A frontend flag is never an authorization source.

## Employee Verification

Every request includes both `companyId` and `roleId`. ADMIN sees the requested designation before deciding. A verified Data Engineer scope cannot authorize a Sales Manager contribution at the same company, a scope at another company, or any contribution after expiry. `ADMIN` remains independent: a normal ADMIN account has no contribution privilege unless it also owns an active employee scope. The repository repeats the authoritative scope check on the same PostgreSQL client and transaction used for the parent/subtype insert.

Legacy rows whose designation could not be assigned unambiguously may remain `ROLE_ID IS NULL`; they are visible for correction but cannot authorize and cannot be approved as a new active scope.

Only active `EMPLOYEE` accounts may request verification. Current employees use `COMPANY_EMAIL_OTP` with a company-email address; former employees use `DOCUMENT` with a short proof type and safe external/reference identifier. A pending or active company verification blocks duplicates.

ADMIN users can inspect the private evidence metadata and move a `PENDING` request to `VERIFIED` or `REJECTED`. Rejection requires a reason. Verification and rejection are written in one locked transaction; verified requests expire after 12 months. Public endpoints never return the evidence fields.

## Submission Moderation

ADMIN authority comes from the current PostgreSQL `USERS.ACCOUNT_ROLE`, reached only after JWT verification. Missing/invalid authentication or an unavailable account returns `401`; an active non-ADMIN account returns `403`.

Allowed transitions are:

- `PENDING -> APPROVED|REJECTED|FLAGGED`
- `APPROVED -> REJECTED|FLAGGED` for reported public content
- `FLAGGED -> REJECTED`

Approval notes are optional; rejection and flagging notes are required. Other transitions return `409`.

The repository locks the submission with `SELECT ... FOR UPDATE`, validates the current state, updates `SUBMISSIONS`, inserts one `MODERATION_ACTIONS` row, and commits. A failure in either write rolls back both. `approved_at` is set only for approval and cleared when approved content is later rejected or flagged. Prior audit rows are never updated or deleted.

## Reports

Authenticated active accounts can report a submission once using `FAKE_DATA`, `DEFAMATION`, `SPAM`, `PRIVACY`, or `OTHER` plus an optional description. The database uniqueness constraint maps duplicates to `409`.

ADMIN report transitions are `OPEN -> REVIEWING|RESOLVED|DISMISSED` and `REVIEWING -> RESOLVED|DISMISSED`. Terminal decisions require a resolution note and record resolver/time atomically. When the report requires a content action, the ADMIN uses the existing submission endpoint so the target status change is locked and audited; report resolution is then recorded separately.

## Public Data and Anonymity

Public review/interview repositories explicitly select only approved fields. `authorName` is populated only for nonanonymous rows. User IDs, email addresses, evidence, reporter identity, and moderation data are absent from public responses. Flagging or rejecting approved content immediately excludes it and its review aggregate contribution.

## Identity Synchronization

The active PostgreSQL seed uses `setval` with `pg_get_serial_sequence` for:

- `USERS.USER_ID`
- `EMPLOYEES.EMPLOYEE_ID`
- `COMPANIES.COMPANY_ID`
- `JOB_ROLES.ROLE_ID`
- `BENEFITS.BENEFIT_ID`
- `EMPLOYMENT_VERIFICATIONS.VERIFICATION_ID`
- `SUBMISSIONS.SUBMISSION_ID`
- `REPORTS.REPORT_ID`
- `MODERATION_ACTIONS.ACTION_ID`

This advances every generated identity beyond explicit sample IDs.

## Expanded Reference Data

The PostgreSQL seed uses `INSERT ... ON CONFLICT DO NOTHING` to add the same 50 company references (35 Bangladesh-focused and 15 international) and 55 cross-industry roles. Company sources are recorded in `database/company_seed_sources.md`.

## Architecture

Application flow is `routes -> controllers -> services -> repositories`. Services own validation and application rules. All PostgreSQL SQL and transaction boundaries stay in repositories.

All API routes are registered before static frontend hosting, so frontend files cannot shadow an API endpoint. Production uses one Render origin. CORS permits the documented local frontend origins and optional exact `CORS_ORIGINS`; it is never configured as an unrestricted authenticated cross-origin policy. Render enables exactly one trusted proxy hop for meaningful request IPs.

```text
backend/
|-- config/          # PostgreSQL pool and JWT settings
|-- controllers/     # HTTP translation
|-- middleware/      # Authentication, ADMIN guard, and errors
|-- repositories/    # SQL and transaction handling
|-- routes/          # Express endpoints
|-- services/        # Validation and workflow rules
|-- tests/           # Unit and live workflow tests
|-- utils/           # Responses and HTTP errors
|-- app.js           # Express composition
`-- server.js        # Pool/server lifecycle
```

## Tests

```bash
npm test
npm run test:integration
```

The 119-test unit suite covers authentication, token revocation, ownership/IDOR, PostgreSQL parameterization, recovery, moderation, privacy, accessibility, exact role-scope authorization, ADMIN independence, rollback behavior, database health, hosting configuration, and schema/data structure.

The live test requires a Supabase PostgreSQL database already prepared with the consolidated schema and data, plus `JWT_SECRET`. It verifies generated identity values, detailed login outcomes, reset-token lifecycle, role-scoped verification and contributions, approved-only publication, reporting, moderation, aggregates, authorization, GET regressions, and rollback cases. A real external SMTP account is not used by the automated suite and must be proven manually with local credentials.

Public registration always creates `account_role = 'USER'`. The fictional sample ADMIN hash is intentionally not a usable password. For manual local ADMIN testing, generate and apply a local BCrypt hash without committing it; the integration test instead promotes and deletes a temporary user.

## Security and Deferred Scope

- Keep `.env`, credentials, JWT secrets, and real verification evidence untracked.
- SQL uses parameterized queries (`$1`, `$2`, …); raw PostgreSQL errors are not returned.
- Password hashes are never present in API responses.
- Raw password-reset tokens exist only in memory and the outgoing link; PostgreSQL stores SHA-256 hashes only.
- ADMIN endpoints require authentication and role authorization.
- Password recovery returns one generic answer for every address. Sign-in still distinguishes an unknown address from a wrong password, a deliberate usability choice that does reveal whether an address is registered.
- Logout, password changes, and password resets immediately revoke older JWTs through `token_version`.
- Real employment-verification OTP/document transport, shared rate limiting, ML runtime integration, advanced recommendations, and live cloud-resource creation remain outside core completion. `render.yaml` defines a new `saple-academic` service; read `docs/security-and-safe-deployment.md` before using it.
- Security headers, rate limits, the Saple Guide, email diagnostics and the representative/jobs API are documented in the root `README.md` and `docs/`.
