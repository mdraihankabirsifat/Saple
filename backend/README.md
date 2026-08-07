# Saple Backend

The Saple backend connects Express 5 to Oracle 19c. It provides public company information, JWT authentication, transactional community contributions, company-specific employee verification, reporting, and ADMIN workflows with immutable submission-moderation history.

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
```

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
| GET | `/api/companies` | Public | List/search companies (`?search=term`) |
| GET | `/api/companies/:companyId` | Public | Company detail |
| GET | `/api/companies/:companyId/benefits` | Public | Company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Verified/community salary summaries |
| GET | `/api/companies/:companyId/reviews` | Public | Approved reviews and rating aggregates |
| POST | `/api/companies/:companyId/reviews` | Employee token | Create a pending review |
| GET | `/api/companies/:companyId/interviews` | Public | Approved interview experiences |
| POST | `/api/companies/:companyId/interviews` | Bearer token | Create a pending interview experience |
| POST | `/api/companies/:companyId/verifications` | Employee token | Request company-specific verification |
| GET | `/api/job-roles` | Public | Controlled job-role values |
| POST | `/api/auth/register` | Public | Create a `NORMAL` or `EMPLOYEE` account |
| POST | `/api/auth/login` | Public | Return JWT and safe user object |
| GET | `/api/auth/me` | Bearer token | Current safe user profile |
| POST | `/api/companies/:companyId/salaries` | Bearer token | Create a pending salary contribution |
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

Login returns a minimal HS256 JWT with `userId` and `role`. Issuer, audience, algorithm, and expiration are verified. Every protected request also reloads the current `account_status` and `account_role`, so suspension, deactivation, or role changes take effect immediately. Invalid credentials and unavailable accounts use safe `401` responses. Use protected endpoints with:

```text
Authorization: Bearer <token>
```

## Transactional Contributions

Salary, review, and interview repositories each use one Oracle connection:

```text
validate active actor + referenced company/role
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

Interview experiences accept active authenticated accounts. They require a role, nonfuture date, difficulty, `1`–`20` rounds, mode, result, duration `0`–`365` days, process description, optional question summary, and boolean anonymity.

All contribution types inherit `VERIFIED` only from a matching, active, non-expired company verification; otherwise they are `UNVERIFIED`. They never self-approve.

## Employee Verification

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

The unit suite covers authentication, current-account middleware checks, input validation, transition rules, private/public mapping, exact calendar dates, and forced rollback of salary, review, interview, verification, report, and moderation writes.

The live test requires Oracle and `JWT_SECRET`. It creates unique users and cleans them afterward while verifying generated identity values, registration/login, verification request and approval, salary/review/interview parent-child writes, approved-only public display, anonymous-field omission, report duplication and resolution, approved-content flagging, moderation history, salary aggregates, authorization, GET regressions, and rollback under forced constraint/write failures.

Public registration always creates `account_role = 'USER'`. The fictional sample ADMIN hash is intentionally not a usable password. For manual local ADMIN testing, generate and apply a local BCrypt hash without committing it; the integration test instead promotes and deletes a temporary user.

## Security and Deferred Scope

- Keep `.env`, credentials, JWT secrets, and real verification evidence untracked.
- SQL uses bind variables; raw Oracle errors are not returned.
- Password hashes are never present in API responses.
- ADMIN endpoints require authentication and role authorization.
- Real OTP/document transport, ML, advanced recommendations, and deployment are intentionally outside core completion.
