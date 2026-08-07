# Saple

Saple is a trust-focused company review, salary insight, benefits, and interview-experience platform developed as a BUET CSE database project. This milestone connects the Oracle data model to an Express API and a responsive Vanilla JavaScript frontend, including real account authentication and authenticated salary contributions.

## Current Implementation

| Layer | Status | What is available |
| --- | --- | --- |
| Database | Implemented | Oracle tables, constraints, indexes, sample data, public views, and analytical salary views |
| Backend | Authenticated write milestone | Existing public company GET endpoints, registration, login, current-user lookup, job-role lookup, and transactional salary submission |
| Frontend | Connected | Responsive public pages, live company data, account flows, shared session state, and the salary form |
| Later milestones | Not implemented | Review/interview submissions, employee-verification workflows, reporting, administration, moderation, ML, and deployment |

## Available Features

- Searchable company directory, company profiles, benefits, and salary summaries backed by Oracle
- Registration for job seekers and current/former employees
- BCrypt password hashing and signed JWT authentication
- Shared frontend session state with signed-in navigation and sign-out
- API-backed company and job-role choices on the salary form
- Authenticated salary submissions written atomically to `SUBMISSIONS` and `SALARY_SUBMISSIONS`
- New salary submissions start as `PENDING`; unverified users do not affect public salary aggregates
- Loading, empty, invalid-ID, API-error, and backend-offline states
- Responsive layouts and accessible forms without a frontend build step

## Trust and Privacy Model

Anonymous submissions retain an internal association with the submitter for ownership and moderation, while privacy-safe public views omit that identity. Registration never exposes the `ADMIN` account role.

Employment verification is company-specific. A salary submission is marked `VERIFIED` only when the submitting user has a matching, active, non-expired `VERIFIED` employment-verification row for that company; otherwise it is `UNVERIFIED`. This milestone does not add a verification workflow.

The schema never stores raw OTP values, uploaded document contents, national identifiers, or other raw confidential evidence. Passwords are stored only as BCrypt hashes.

## Salary Range Concepts

Salary ranges come from Oracle views rather than redundant company attributes:

- **Verified Salary Range:** approved submissions with `verification_status = 'VERIFIED'`.
- **Community Salary Range:** every approved salary submission, verified or unverified.

New submissions use `submission_status = 'PENDING'`, so they do not enter either public range before a future moderation workflow approves them.

## Technology Stack

- Oracle Database 19c
- Node.js and Express 5
- node-oracledb in Thin mode
- BCrypt and JSON Web Tokens
- HTML5, CSS, and Vanilla JavaScript ES modules

No frontend framework, CSS framework, TypeScript, or build step is required.

## Quick Start

### 1. Prepare Oracle

Connect to the intended Oracle schema using SQL*Plus, SQLcl, Navicat, or another compatible client, then run:

```sql
@database/01_create_user.sql
@database/02_create_tables.sql
@database/03_insert_sample_data.sql
@database/04_test_queries.sql
```

The final three statements in `03_insert_sample_data.sql` synchronize the `USERS.USER_ID`, `EMPLOYEES.EMPLOYEE_ID`, and `SUBMISSIONS.SUBMISSION_ID` identity generators after the explicit sample IDs are committed. This ensures later generated IDs are above the corresponding sample-data maximums.

`database/01_create_user.sql` is currently empty, so an existing Oracle user with permission to create tables, views, and indexes is required. The cleanup section in `02_create_tables.sql` can drop and rebuild existing Saple objects; review it before running against data you need to keep.

### 2. Configure and start the backend

From `backend/`:

```bash
npm install
```

Copy `backend/.env.example` to `backend/.env` and provide local values:

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

Then start the API:

```bash
npm run dev
```

The default API address is `http://localhost:3000`.

### 3. Serve the frontend

From the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`. Keep the backend running on port `3000`.

## Current API

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | API welcome response |
| GET | `/api/health` | Public | Express process health |
| GET | `/api/health/database` | Public | Oracle connection health |
| GET | `/api/companies` | Public | List or search public companies with `?search=term` |
| GET | `/api/companies/:companyId` | Public | Get one public company profile |
| GET | `/api/companies/:companyId/benefits` | Public | Get company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Get verified and community salary summaries |
| POST | `/api/auth/register` | Public | Create a normal or employee account |
| POST | `/api/auth/login` | Public | Authenticate and return a signed JWT plus safe user data |
| GET | `/api/auth/me` | Bearer token | Return the current safe user profile |
| GET | `/api/job-roles` | Public | List job roles for controlled salary input |
| POST | `/api/companies/:companyId/salaries` | Bearer token | Create one pending salary contribution transaction |

See [`backend/README.md`](backend/README.md) for request bodies, transaction behavior, tests, and Oracle troubleshooting.

## Frontend Pages

| Page | Purpose |
| --- | --- |
| `frontend/index.html` | Homepage, search entry, trust model, and salary methodology |
| `frontend/companies.html` | Live company directory and backend-powered search |
| `frontend/company-details.html?id=<id>` | Live profile, benefits, salary summaries, and later-workflow placeholders |
| `frontend/login.html` | Real login with JWT session creation |
| `frontend/register.html` | Real job-seeker/employee registration |
| `frontend/submit-salary.html` | Authenticated salary contribution with live company and job-role choices |
| `frontend/submit-review.html` | Review workflow status placeholder |
| `frontend/interview-experience.html` | Interview workflow status placeholder |

See [`frontend/README.md`](frontend/README.md) for frontend behavior and manual testing guidance.

## Project Structure

```text
Saple/
|-- backend/                 # Express, authentication, and Oracle API
|-- database/                # Oracle schema, sample data, and test queries
|-- docs/                    # Requirements, relational schema, and project notes
|-- frontend/                # Responsive HTML, CSS, and Vanilla JavaScript UI
|-- ERD.pdf                  # Entity-relationship diagram
`-- README.md                # Project overview and setup
```

## Database Model

The Oracle schema contains `users`, `employees`, `companies`, `job_roles`, `benefits`, `company_benefits`, `employment_verifications`, `submissions`, `salary_submissions`, `company_reviews`, `interview_experiences`, `reports`, and `moderation_actions`.

Privacy-safe and analytical views include:

- `vw_public_companies`
- `vw_public_approved_reviews`
- `vw_verified_salary_summary`
- `vw_community_salary_summary`

## Security Notes

- Never commit `backend/.env`, database credentials, or the JWT secret.
- Passwords are BCrypt-hashed with 12 salt rounds and are never returned by the API.
- JWTs are signed with HS256 and verified for algorithm, issuer, audience, and expiration.
- The browser stores only the token and safe user object in `sessionStorage`; sessions end when that browser session is closed or the user signs out.
- Raw Oracle errors are logged by the backend and are not exposed to API clients.
- Public views omit contributor identity and other private moderation/verification fields.
- Administrative privileges are not exposed through public registration.

## Tests

From `backend/`:

```bash
npm test
npm run test:integration
```

Unit tests use repository mocks. Integration tests require the configured Oracle database and `JWT_SECRET`; they create and clean up their own test rows while checking authentication, ID generation, transaction rollback, salary status, and existing GET regressions.

## Deferred Scope

Admin moderation, review submission, interview submission, employee-verification flows, reporting, ML, and deployment remain later milestones.

## Sample Data Notice

All sample names, companies, email addresses, proof references, review text, and test credentials are fictional. Demonstration password hashes are intentionally unusable in production.
