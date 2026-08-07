# Saple

Saple is a trust-focused company review, salary insight, benefits, and interview-experience platform developed as a BUET CSE database project. It helps graduates and job seekers research workplaces while supporting moderated community contributions and privacy-aware anonymous sharing.

The repository currently contains a complete Oracle data model, a read-only Express API for public company data, and a responsive Vanilla JavaScript frontend. Authentication and contribution forms have been prepared in the UI but are intentionally not connected to write endpoints yet.

## Current Implementation

| Layer | Status | What is available |
| --- | --- | --- |
| Database | Implemented | Oracle tables, constraints, indexes, sample data, public views, and analytical salary views |
| Backend | Read-only milestone | Health checks, company directory/search, company profiles, benefits, and salary summaries |
| Frontend | Implemented | Responsive application shell, homepage, live company pages, salary methodology, and accessible state handling |
| Authentication UI | Prepared | Login and registration validation without fake requests, tokens, or credential storage |
| Contribution UI | Prepared | Salary form with live company choices and local validation; review/interview placeholders |
| Write workflows | Not implemented | Authentication, employee verification, salary/review/interview submission, reporting, and moderation endpoints |

## Available Features

- Searchable public company directory backed by Oracle through Express
- Company profiles with industry, location, size, description, and safe website links
- Company benefits loaded from the API
- Verified and Community Salary Range summaries
- Contribution counts to help readers interpret salary confidence
- Loading, empty, invalid-ID, API-error, and backend-offline states
- Shared responsive navigation, contribution menu, footer, cards, buttons, forms, and design tokens
- Mobile navigation and layouts tested at 1440px, 1024px, 768px, and 430px
- Accessible labels, semantic headings, visible keyboard focus, live status messages, and reduced-motion support
- UI-only login, registration, and salary contribution workflows with client-side validation
- Honest placeholders for review and interview workflows that do not invent data or backend behavior

## Trust and Privacy Model

Anonymous submissions retain an internal association with the submitter for ownership and moderation, while privacy-safe public views do not expose that identity.

Employment verification is company-specific. Verification for one company does not verify an employee for another company. The database supports:

- `COMPANY_EMAIL_OTP` for current employees
- `DOCUMENT` for former employees

The schema never stores raw OTP values, uploaded document contents, national identifiers, or other raw confidential evidence. Passwords are designed to be stored only as hashes once authentication is implemented.

## Salary Range Concepts

Salary ranges are derived from Oracle views rather than stored as redundant company attributes.

### Verified Salary Range

Uses salary submissions where:

- `submission_status = 'APPROVED'`
- `verification_status = 'VERIFIED'`

### Community Salary Range

Uses every approved salary submission, including verified and unverified approved contributions:

- `submission_status = 'APPROVED'`

The product deliberately uses **Community Salary Range**, not “Unverified Salary Range.”

## Technology Stack

- Oracle Database 19c
- SQL and PL/SQL-compatible setup scripts
- Node.js and Express 5
- node-oracledb in Thin mode
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

`database/01_create_user.sql` is currently empty, so an existing Oracle user with permission to create tables, views, and indexes is required. The cleanup section in `02_create_tables.sql` can drop and rebuild existing Saple objects; review it before running against data you need to keep.

### 2. Configure and start the backend

From `backend/`:

```bash
npm install
```

Copy `.env.example` to `.env` and configure the local Oracle connection:

```env
PORT=3000
DB_USER=SAPLE
DB_PASSWORD=your_local_password
DB_CONNECT_STRING=localhost:1521/ORCLPDB1
DB_POOL_MIN=1
DB_POOL_MAX=5
DB_POOL_INCREMENT=1
```

Then start the API:

```bash
npm run dev
```

The default API address is `http://localhost:3000`.

### 3. Serve the frontend

From the repository root, use any static HTTP server. For example:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`.

Using a static server is recommended because the company pages use JavaScript modules. Keep the backend running on port `3000` for live company data.

## Current API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/` | API welcome response |
| GET | `/api/health` | Express process health |
| GET | `/api/health/database` | Oracle connection health |
| GET | `/api/companies` | List public companies |
| GET | `/api/companies?search=term` | Backend-powered company search |
| GET | `/api/companies/:companyId` | Get one public company profile |
| GET | `/api/companies/:companyId/benefits` | Get company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Get verified and community salary summaries |

All current endpoints are read-only. See [`backend/README.md`](backend/README.md) for setup, response examples, and Oracle troubleshooting.

## Frontend Pages

| Page | Purpose |
| --- | --- |
| `frontend/index.html` | Homepage, company-search entry, trust model, and salary methodology |
| `frontend/companies.html` | Live company directory and backend-powered search |
| `frontend/company-details.html?id=<id>` | Live company profile, benefits, salaries, and future-workflow placeholders |
| `frontend/login.html` | UI-only login with local validation |
| `frontend/register.html` | UI-only job-seeker/employee registration with local validation |
| `frontend/submit-salary.html` | Salary contribution form with live company options and local validation |
| `frontend/submit-review.html` | Review workflow status placeholder |
| `frontend/interview-experience.html` | Interview workflow status placeholder |

See [`frontend/README.md`](frontend/README.md) for frontend architecture, validation behavior, and manual testing guidance.

## Future Backend Contracts

The prepared UI will need compatible endpoints before its forms can submit data:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- A job-role lookup endpoint, such as `GET /api/job-roles`
- `POST /api/companies/:companyId/salaries`

Review, interview, verification, reporting, and moderation APIs remain later milestones. The frontend does not assume these routes already exist.

## Project Structure

```text
Saple/
|-- backend/                 # Read-only Express and Oracle API
|-- database/                # Oracle schema, sample data, and test queries
|-- docs/                    # Requirements, relational schema, and project notes
|-- frontend/                # Responsive HTML, CSS, and Vanilla JavaScript UI
|-- ERD.pdf                  # Entity-relationship diagram
`-- README.md                # Project overview and setup
```

## Database Model

The Oracle schema contains:

1. `users`
2. `employees`
3. `companies`
4. `job_roles`
5. `benefits`
6. `company_benefits`
7. `employment_verifications`
8. `submissions`
9. `salary_submissions`
10. `company_reviews`
11. `interview_experiences`
12. `reports`
13. `moderation_actions`

Privacy-safe and analytical views include:

- `vw_public_companies`
- `vw_public_approved_reviews`
- `vw_verified_salary_summary`
- `vw_community_salary_summary`

## Security Notes

- Never commit `backend/.env` or real credentials.
- The frontend does not store passwords, fake JWTs, or contribution data in localStorage.
- Raw Oracle errors are logged by the backend and are not exposed to API clients.
- Public views omit passwords, contributor identity, private company email, proof references, rejection reasons, reporter identity, and internal moderation notes.
- Administrative privileges are not exposed as a public registration option.

## Sample Data Notice

All sample names, companies, email addresses, proof references, review text, and test credentials are fictional. Demonstration password hashes are intentionally unusable in production.
