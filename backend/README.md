# Saple Backend

The Saple backend connects Express 5 to Oracle 19c. It provides public approved company/salary/review/interview browsing, JWT authentication, SMTP password recovery, safe profile changes, exact company-and-designation verified contributions, reporting, and ADMIN workflows with immutable submission-moderation history.

## Prerequisites and Setup

- Node.js 18 or newer and npm
- Oracle Database 19c with the Saple scripts applied
- Network access to the Oracle listener

node-oracledb runs in Thin mode; Oracle Instant Client is not required.

```bash
npm install
```

Copy `.env.example` to `.env` and configure:

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

Install dependencies with `npm install`; Nodemailer is included in `package.json`. For Gmail, enable two-step verification, create an App Password, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, and `SMTP_SECURE=false`, then put the account and App Password in `SMTP_USER` and `SMTP_PASS`. Use provider-specific values for another SMTP service. Port `465` normally requires `SMTP_SECURE=true`. Never commit `backend/.env`.

Apply Oracle scripts in this order for a clean local build:

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

For the current existing populated schema, `06_create_password_reset_tokens.sql` is already completed. Run `07_add_role_scoped_verification.sql`, then `08_seed_demo_salary_reviews.sql`. Do not rerun `02_create_tables.sql` or `06`. Migration `07` deliberately keeps unresolved legacy roles nullable and unauthorized; seed `08` is rerunnable synthetic academic data and does not delete existing rows.

```bash
npm run dev
# or: npm start
```

The Oracle pool initializes before HTTP listening. The default address is `http://localhost:3000`.

## Endpoint Reference

Successful responses use `{ "success": true, "message": "...", "data": ... }`. Errors expose a safe application message, not raw Oracle details.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | API welcome |
| GET | `/api/health` | Public | Express health |
| GET | `/api/health/database` | Public | Oracle health |
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
| POST | `/api/auth/forgot-password` | Public, rate-limited | Email a temporary password-reset link |
| POST | `/api/auth/reset-password` | Public, rate-limited | Atomically consume a token and update the password |
| GET | `/api/auth/me` | Bearer token | Current safe user profile |
| PATCH | `/api/auth/me` | Bearer token | Change full name only |
| PATCH | `/api/auth/me/password` | Bearer token | Change password with current password |
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

Login returns a minimal HS256 JWT with `userId` and `role`. Issuer, audience, algorithm, and expiration are verified. Every protected request also reloads the current `account_status` and `account_role`, so suspension, deactivation, or role changes take effect immediately. Login reports unknown email, incorrect password, suspended account, and deactivated account separately as required for this academic project. Use protected endpoints with:

```text
Authorization: Bearer <token>
```

`GET /api/auth/me` returns active, non-expired exact scopes as `verifiedScopes`, containing only `companyId`, `companyName`, `roleId`, `roleName`, and `expiresAt`. It never exposes employee IDs, evidence, reviewer data, or internal references. Profile updates accept only `fullName`; email, account type, role, account status, employment status, and verification state cannot be changed there.

### Password recovery

`POST /api/auth/forgot-password` normalizes the email, checks account status, generates 32 cryptographically random bytes, stores only their SHA-256 hash, and sends the raw value only inside the temporary email link. Existing active tokens are revoked in the same Oracle transaction. SMTP delivery runs before commit; delivery failure rolls back both the new token and revocation changes and returns a controlled `503`.

Live diagnosis must start the actual backend and call the route directly. An unknown valid email returns `404`, `success: false`, and exactly `No account was found with that email address.` without inserting a token. For a real account, verify provider acceptance, a 64-character stored hash, one-time reset behavior, and rollback under an invalid SMTP configuration. Required local names are `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `FRONTEND_URL`; never print their values. The detailed unknown-email response is an academic choice and should normally be generic in production.

`POST /api/auth/reset-password` accepts `token`, `newPassword`, and `confirmPassword`. It enforces the existing 8-to-72-byte letter-and-number policy, locks the matching hash row, rejects expired/used/revoked tokens, updates the BCrypt hash, marks the token used, revokes other tokens, and commits once. The raw token is never returned or logged. The default expiry is 15 minutes.

Both recovery endpoints use an in-memory IP/request-key limiter. This is suitable for the single-process academic deployment; multi-instance production deployment needs a shared rate-limit store. Detailed account-existence responses enable enumeration and are present only because the project requirements explicitly request them. A production service normally returns generic login and recovery messages.

Saple uses stateless access JWTs without refresh-token storage. A successful password reset therefore cannot immediately revoke a JWT that was already issued; production revocation would require a token version or deny-list.

## Public Browse Queries

The top-level `GET /api/salaries`, `/api/reviews`, and `/api/interviews` endpoints require no token and select approved rows only. They support bound company/role/location filters; salaries add range and `COMMUNITY|VERIFIED` source filters, reviews add minimum rating, and interviews add difficulty/mode. Public company filtering uses Oracle CTEs, `LEFT JOIN`, `EXISTS`, `GROUP BY`, aggregates, and bound predicates for name, industry, role, location, salary source/range, size, rating, and available-data flags.

## Transactional Contributions

Salary, review, and interview repositories each use one Oracle connection:

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

The salary body contains `roleId`, positive `baseSalary`, optional nonnegative `additionalCompensation`, three-letter uppercase `currency`, `MONTHLY|YEARLY` pay period, experience from `0` to `60`, controlled employment/work-mode values, salary year `2000`–`2100`, and boolean `isAnonymous`.

### Review input

Reviews require an active employee account whose profile status matches the supplied `CURRENT|FORMER` value. They include an optional role, title, five ratings from `1` to `5` with at most one decimal, pros, cons, optional advice, a nonfuture review date, and boolean anonymity.

### Interview input

Interview experiences require a company-verified employee. They include a role, nonfuture date, difficulty, `1`–`20` rounds, mode, result, duration `0`–`365` days, process description, optional question summary, and boolean anonymity.

All three contribution routes and repositories require a matching active, non-expired company verification. Missing verification returns `403`; accepted contributions are marked `VERIFIED` and remain `PENDING` until moderation. A frontend flag is never an authorization source.

## Employee Verification

Every request includes both `companyId` and `roleId`. ADMIN sees the requested designation before deciding. A verified Data Engineer scope cannot authorize a Sales Manager contribution at the same company, a scope at another company, or any contribution after expiry. `ADMIN` remains independent: a normal ADMIN account has no contribution privilege unless it also owns an active employee scope. The repository repeats the authoritative scope check on the same Oracle connection and transaction used for the parent/subtype insert.

Migration `07` backfills an old row only when all of that employee's company contributions identify one distinct role. Ambiguous or unsupported rows remain `ROLE_ID IS NULL`; they are visible for correction but cannot authorize and cannot be approved as a new active scope.

Only active `EMPLOYEE` accounts may request verification. Current employees use `COMPANY_EMAIL_OTP` with a company-email address; former employees use `DOCUMENT` with a short proof type and safe external/reference identifier. A pending or active company verification blocks duplicates.

ADMIN users can inspect the private evidence metadata and move a `PENDING` request to `VERIFIED` or `REJECTED`. Rejection requires a reason. Verification and rejection are written in one locked transaction; verified requests expire after 12 months. Public endpoints never return the evidence fields.

## Submission Moderation

ADMIN authority comes from the current Oracle `USERS.ACCOUNT_ROLE`, reached only after JWT verification. Missing/invalid authentication or an unavailable account returns `401`; an active non-ADMIN account returns `403`.

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

After sample inserts and `COMMIT`, `database/03_insert_sample_data.sql` runs `START WITH LIMIT VALUE` for:

- `USERS.USER_ID`
- `EMPLOYEES.EMPLOYEE_ID`
- `COMPANIES.COMPANY_ID`
- `JOB_ROLES.ROLE_ID`
- `BENEFITS.BENEFIT_ID`
- `EMPLOYMENT_VERIFICATIONS.VERIFICATION_ID`
- `SUBMISSIONS.SUBMISSION_ID`
- `REPORTS.REPORT_ID`
- `MODERATION_ACTIONS.ACTION_ID`

This advances each identity beyond explicit sample IDs without changing constraints. Live rollback probes confirmed a generated `VERIFICATION_ID` greater than `4` and `REPORT_ID` greater than `2`.

## Expanded Reference Data

Run `database/05_expand_reference_data.sql` after the base sample script. Its case-insensitive `MERGE` statements add 50 company references (35 Bangladesh-focused and 15 international) plus 55 cross-industry job roles without modifying the schema or deleting existing data. Company sources are recorded in `database/company_seed_sources.md`. These are employer-directory records only; Saple never imports third-party salary, review, or interview claims as submissions.

## Architecture

Application flow is `routes -> controllers -> services -> repositories`. Services own validation and application rules. All Oracle SQL and transaction boundaries stay in repositories.

```text
backend/
|-- config/          # Oracle pool and JWT settings
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

The 94-test unit suite covers the prior authentication, recovery, moderation, privacy, and accessibility behavior plus exact role-scope authorization, ADMIN independence, invalidation rollback, migration/seed structure, safe scope fields, approved rating aggregates, and responsive browse sidebars.

The live test requires Oracle with migrations `06` and `07`, plus `JWT_SECRET`. Seed `08` is independently guarded and may already be present. It verifies generated identity values, detailed login outcomes, reset-token lifecycle, role-scoped verification and contributions, approved-only publication, reporting, moderation, aggregates, authorization, GET regressions, and rollback cases. A real external SMTP account is not used by the automated suite and must be proven manually with local credentials.

Public registration always creates `account_role = 'USER'`. The fictional sample ADMIN hash is intentionally not a usable password. For manual local ADMIN testing, generate and apply a local BCrypt hash without committing it; the integration test instead promotes and deletes a temporary user.

## Security and Deferred Scope

- Keep `.env`, credentials, JWT secrets, and real verification evidence untracked.
- SQL uses bind variables; raw Oracle errors are not returned.
- Password hashes are never present in API responses.
- Raw password-reset tokens exist only in memory and the outgoing link; Oracle stores SHA-256 hashes only.
- ADMIN endpoints require authentication and role authorization.
- Detailed login/recovery messages allow account enumeration; production systems should use generic responses.
- Existing stateless JWTs are not immediately revoked by password reset.
- Real employment-verification OTP/document transport, shared rate limiting, ML, advanced recommendations, and deployment are intentionally outside core completion.
