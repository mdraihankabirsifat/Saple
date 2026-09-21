# 🌱 Saple

**Saple is an independent BUET CSE academic project for company and career
insights.** It brings together company profiles, salary ranges, moderated
workplace reviews, interview experiences and job postings — and shows how
trustworthy each piece of information is, and why.

Saple is not affiliated with, endorsed by, or an official login or careers
service for any company it lists.

> **Status.** The code, schema, migrations, tests and documentation are
> complete for this phase. The site is **not currently deployed**: the previous
> Render service was flagged by Google Web Risk, suspended and deleted.
> Redeployment, email delivery, the AI provider and the Google review are owner
> actions; see [What still needs your accounts](#what-still-needs-your-accounts).

---

## Contents

- [Architecture](#architecture)
- [Actors and permissions](#actors-and-permissions)
- [Trust model](#trust-model)
- [Database](#database)
- [Running locally](#running-locally)
- [Configuration](#configuration)
- [API](#api)
- [Frontend pages](#frontend-pages)
- [Tests](#tests)
- [Security](#security)
- [What still needs your accounts](#what-still-needs-your-accounts)
- [Presentation sequence](#presentation-sequence)
- [Known limitations](#known-limitations)
- [Documentation map](#documentation-map)

---

## Architecture

```text
Browser (vanilla HTML, CSS and JavaScript modules; no build step, no CDN)
   │  HTTPS, one origin — strict self-only Content-Security-Policy
   ▼
Express 5 on Node.js
   routes → controllers → services → repositories
   │  raw parameterized SQL through `pg`; every multi-step write is one transaction
   ▼
PostgreSQL on Supabase  (21 tables, 5 views)
```

| Layer | Technology |
|-------|------------|
| Database | PostgreSQL (Supabase), additive migrations, CHECK / FK / partial unique constraints |
| Backend | Node.js, Express 5, `pg`, BCrypt, JSON Web Tokens, Nodemailer |
| Frontend | HTML5, CSS custom-property design tokens, inline SVG, vanilla ES modules |
| Optional | An OpenAI-compatible AI provider for the Saple Guide; a standalone ML prototype in `ml/` |

The browser never talks to Supabase directly: there is no Supabase client, anon
key or service-role key in the frontend. The Oracle 19c files under
`database/sql/` are the preserved earlier course milestone and are not used at
runtime.

---

## Actors and permissions

| Capability | Public | Job seeker | Employee | Representative | Admin |
|------------|:-----:|:-----:|:-----:|:-----:|:-----:|
| Browse approved companies, salaries, reviews, interviews | ✓ | ✓ | ✓ | ✓ | ✓ |
| Browse published jobs and announcements, use the Saple Guide | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage own profile and password | | ✓ | ✓ | ✓ | ✓ |
| Receive private notifications | | ✓ | ✓ | ✓ | ✓ |
| Report a public contribution (once each) | | ✓ | ✓ | ✓ | ✓ |
| Apply to a job, track and withdraw own applications | | ✓ | ✓ | | |
| Request verification for an exact company and role | | | ✓ | | |
| Contribute salary / review / interview within a verified scope | | | ✓ | | |
| Request a company representative assignment | | ✓ | ✓ | | |
| Decide verification requests — **own companies only** | | | | ✓ | ✓ (all) |
| Create, publish, close, archive vacancies — **own companies only** | | | | ✓ | close any |
| Review applications — **own companies only** | | | | ✓ | view any |
| Approve / reject / revoke representative assignments | | | | | ✓ |
| Moderate contributions, triage reports, manage announcements | | | | | ✓ |

- Registration always creates an ordinary account. It can never create an
  administrator or a representative.
- A representative is an ordinary account that an administrator has bound to
  one or more companies. A company can have several.
- Any number of administrators is supported; none is hard-coded.
- Every protected request reloads status, role, token version and active
  company scopes from PostgreSQL. Revoking an assignment, suspending an account
  or changing a password takes effect on the very next request, even while an
  older JWT is still within its lifetime.
- Being a representative for a company grants no right to contribute there,
  and being an administrator grants no contribution rights at all.

---

## Trust model

**Approved-only publication.** Every contribution starts `PENDING` and is
invisible until an administrator approves it. Each decision writes an
immutable moderation record and notifies the contributor.

**Two salary ranges.**

- **Verified Salary Range** — approved salaries from contributors verified for
  that exact company and role.
- **Community Salary Range** — every approved salary.

Both show their contribution count; pending, rejected and flagged salaries
affect neither.

**Anonymous publicly, accountable internally.** A contribution can be shown
without its author's name, but Saple keeps the internal link so reports can be
investigated and decisions audited.

**Exact-scope verification.** Verification for one company never implies
another, and one role never implies another. A request is decided by an active
representative of that company, with administrators as oversight and fallback.
Current employees give a company email address (no code is sent); former
employees give a proof reference (no file is uploaded).

---

## Database

The active schema is `database/postgres/01_final_schema_postgres.sql`:
**21 tables and 5 views**.

| Domain | Tables |
|--------|--------|
| Accounts | `users`, `employees`, `password_reset_tokens`, `notifications` |
| Verification and representatives | `employment_verifications`, `company_representatives`, `representative_assignment_actions` |
| Company reference | `companies`, `job_roles`, `benefits`, `company_benefits` |
| Contributions | `submissions`, `salary_submissions`, `company_reviews`, `interview_experiences` |
| Moderation and announcements | `reports`, `moderation_actions`, `announcements` |
| Jobs | `job_postings`, `job_applications`, `job_application_status_history` |

Views: `vw_public_companies`, `vw_public_approved_reviews`,
`vw_verified_salary_summary`, `vw_community_salary_summary`,
`vw_public_open_jobs`.

- **ERD:** [`ERD.pdf`](ERD.pdf), [`docs/ERD.html`](docs/ERD.html) and
  [`docs/ERD.md`](docs/ERD.md), all generated from the schema file by
  `node docs/tools/build-erd.js`. A test fails if they go stale.
- **Relational schema, constraints, cardinalities and status transitions:**
  [`docs/relational_schema.md`](docs/relational_schema.md).

### Status transitions

| Entity | Allowed transitions |
|--------|---------------------|
| Submission | `PENDING → APPROVED / REJECTED / FLAGGED`; `APPROVED → REJECTED / FLAGGED`; `FLAGGED → REJECTED` |
| Verification | `PENDING → VERIFIED / REJECTED`; verified rows stop authorizing after 12 months |
| Report | `OPEN → REVIEWING`; `OPEN / REVIEWING → RESOLVED / DISMISSED` |
| Representative assignment | `PENDING → ACTIVE / REJECTED`; `ACTIVE → REVOKED` |
| Job posting | `DRAFT → PUBLISHED → CLOSED → ARCHIVED` |
| Application (reviewer) | `SUBMITTED → UNDER_REVIEW / SHORTLISTED / ACCEPTED / REJECTED`; `UNDER_REVIEW → SHORTLISTED / ACCEPTED / REJECTED`; `SHORTLISTED → ACCEPTED / REJECTED` |
| Application (applicant) | `SUBMITTED / UNDER_REVIEW / SHORTLISTED → WITHDRAWN` |

Rejections, revocations, application acceptances and rejections require a
written reason. Every transition is one transaction: row lock, status change,
history row and notification together.

### Setting up Supabase

**Existing project** (already running the 14-table schema): apply the four
additive migrations in order, rehearsing on a backup first —
[`database/postgres/migrations/README.md`](database/postgres/migrations/README.md).

```text
001_account_roles_and_company_representatives.sql
002_jobs_and_applications.sql
003_announcements_and_notifications.sql
004_public_job_views_and_grants.sql
```

**Fresh project:** run `01_final_schema_postgres.sql`, then optionally the
synthetic `02_final_demo_data_postgres.sql` (fresh projects only), then the
read-only `03_schema_and_data_demo_postgres.sql`, which should report
21 tables and 5 views. More detail: [`docs/supabase_setup.md`](docs/supabase_setup.md).

Both paths were verified to produce an identical schema — every table, column,
constraint, index and view — by running them against an in-process PostgreSQL
engine (PGlite). The migrations preserved every existing row. They have **not**
yet been run on the live Supabase project.

Company provenance is in
[`database/company_seed_sources.md`](database/company_seed_sources.md). All
people, salaries, reviews, interviews, vacancies and applications in the demo
data are synthetic and labelled as such.

---

## Running locally

### Same origin (recommended)

```bash
cd backend
npm ci
cp .env.example .env     # then set DATABASE_URL and JWT_SECRET
npm start                # http://localhost:3000
```

Express serves the frontend and the API from one origin, so no CORS setup is
needed. Without `DATABASE_URL` the server refuses to start with
`Missing required database configuration: DATABASE_URL` — deliberately, rather
than serving a half-working site.

### A separate static server

Live Server, `python -m http.server` and similar work on any local port,
including 5500 and 5501:

```bash
python -m http.server 5501 --directory frontend
```

The frontend detects a local static origin and sends API calls to
`http://localhost:3000`. Ports 5500 and 5501 on `localhost` and `127.0.0.1`
are already in the CORS allow-list; add any other exact origin to
`CORS_ORIGINS`. A developer can point a *local* page at a different backend by
setting `localStorage['saple.api-base-url']`; on a deployed site that override
is ignored unless it names the page's own origin.

If the API is unreachable, pages say which of eleven failure kinds occurred —
network, timeout, CORS, an HTML page where JSON was expected, server error,
database unavailable, sign-in required, forbidden, not found, conflict, rate
limited — with a Retry button. Technical detail appears only on local hosts.

### Docker fallback

With Docker Desktop running:

```bash
npm run local:up --prefix backend      # http://localhost:3000, own PostgreSQL on :5433
npm run local:accounts --prefix backend
npm run local:down --prefix backend
```

This uses an independent local database seeded with the synthetic demo data. It
needs no Supabase credentials and never touches `backend/.env`. Generated demo
passwords are written to the ignored root `.env.local`.

### Offline browsing

After one online visit, a service worker keeps the public pages available
offline, and public API responses are cached for up to seven days (30
requests, about 1.5 million characters). Account, notification, application,
representative, admin and Saple Guide data are never cached, by an explicit
allow-list.

---

## Configuration

All values go in `backend/.env` locally, or the host's private environment
settings. `backend/.env.example` lists every name with placeholders only.

| Variable | Required | Purpose |
|----------|:--------:|---------|
| `DATABASE_URL` | yes | Supabase Session-pooler connection string |
| `JWT_SECRET` | yes | Long random signing secret |
| `JWT_EXPIRES_IN` | | Default `1d` |
| `DB_SSL`, `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS` | | Pool settings |
| `CORS_ORIGINS` | | Extra exact origins; empty for same-origin hosting |
| `FRONTEND_URL` | for recovery | Public origin used in reset links |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | | Default `15` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for email | See [`docs/email-setup-and-test.md`](docs/email-setup-and-test.md) |
| `SECURITY_CONTACT` | | `mailto:` or `https:` address published in `security.txt` |
| `AI_ENABLED`, `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | | Optional; see [`docs/ai-assistant-setup.md`](docs/ai-assistant-setup.md) |

---

## API

Every `/api` response — including 404, 413, 429 and 500 — is JSON:
`{ "success": boolean, "message": string, "data"?: ... }`.

**Access:** *Public*; *Signed in* (any active account); *Owner* (only the
account the record belongs to); *Job seeker* (`USER` role); *Verified scope*
(active verification for that exact company and role); *Representative*
(active assignment for the company involved); *Admin*.

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/`, `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` | Public | Site, crawler rules, public-page sitemap, security contact |
| GET | `/api`, `/api/health`, `/api/health/database` | Public | Welcome, process health, database readiness |
| GET | `/api/stats/overview` | Public | Live public counts for the homepage |
| GET | `/api/announcements` | Public | Announcements inside their schedule |
| GET | `/api/companies`, `/api/companies/filter-options` | Public | Company search and filter options |
| GET | `/api/companies/:id`, `…/benefits`, `…/salary-summary`, `…/reviews`, `…/interviews` | Public | Company profile and approved data |
| GET | `/api/salaries`, `/api/reviews`, `/api/interviews`, `/api/job-roles` | Public | Approved data across companies |
| GET | `/api/jobs`, `/api/jobs/filter-options`, `/api/jobs/:jobId` | Public | Published, in-deadline jobs only; `sort` = `NEWEST` (default), `DEADLINE` or `COMPANY` |
| GET | `/api/assistant/status` | Public | Whether the guide can use a provider (never which one) |
| POST | `/api/assistant/messages` | Public, rate-limited | Ask the Saple Guide |
| POST | `/api/auth/register`, `/api/auth/login` | Public, rate-limited | Create account (always `USER`), sign in |
| POST | `/api/auth/forgot-password`, `/api/auth/reset-password` | Public, rate-limited | Generic-answer recovery; single-use reset |
| POST | `/api/auth/logout` | Signed in | Revoke the current session |
| GET / PATCH | `/api/auth/me`, `/api/auth/me/password` | Signed in | Profile, name change, password change |
| GET | `/api/auth/me/submissions[/:id]` | Owner | Own contributions |
| POST | `/api/companies/:id/salaries`, `…/reviews`, `…/interviews` | Verified scope | New `PENDING` contribution |
| POST | `/api/companies/:id/verifications` | Signed in (employee) | Verification request |
| POST | `/api/submissions/:id/reports` | Signed in, rate-limited | Report once |
| POST | `/api/jobs/:jobId/applications` | Job seeker, rate-limited | Apply once before the deadline |
| GET | `/api/me/applications[/:id]` | Owner | Own applications and history |
| PATCH | `/api/me/applications/:id/withdraw` | Owner | Withdraw while open |
| GET | `/api/me/notifications`, `/api/me/notifications/unread-count` | Owner | Private notifications |
| PATCH | `/api/me/notifications/:id/read`, `/api/me/notifications/read-all` | Owner | Mark read |
| GET / POST | `/api/me/representative-assignments` | Signed in, rate-limited | Own assignments; request one |
| GET | `/api/representative/workspace` | Representative | Active company scopes |
| GET / PATCH | `/api/representative/verifications[/:id][/status]` | Representative (own companies) | Verification queue and decisions |
| GET / POST / PUT / PATCH | `/api/representative/jobs…`, `/api/representative/companies/:id/jobs` | Representative (own companies) | Vacancy management |
| GET / PATCH | `/api/representative/applications[/:id][/status]` | Representative (own companies) | Application review |
| GET / PATCH | `/api/admin/submissions/…` | Admin | Moderation queue, detail, decisions, history |
| GET / PATCH | `/api/admin/verifications/…` | Admin | All verification requests, fallback decisions |
| GET / PATCH | `/api/admin/reports/…` | Admin | Report triage |
| GET / PATCH | `/api/admin/representative-assignments/…` | Admin | Approve, reject, revoke; history |
| GET / POST / PUT / PATCH | `/api/admin/announcements/…` | Admin | Announcement management |
| GET / PATCH | `/api/admin/jobs/…`, `/api/admin/applications/…` | Admin | Oversight across all companies |

Contracts and transaction rules: [`backend/README.md`](backend/README.md).

---

## Frontend pages

| Page | Purpose |
|------|---------|
| `index.html` | Homepage: identity, trust model, live counts, featured companies and jobs, pathways |
| `companies.html`, `company-details.html?id=` | Directory, profile, benefits, both salary ranges, reviews, interviews, reporting |
| `salaries.html`, `reviews.html`, `interviews.html` | Approved data across companies |
| `jobs.html`, `job-details.html?id=` | Job board with filters; job detail and application |
| `my-applications.html` | Own applications, status history, withdrawal |
| `representative.html` | Company workspace: verification queue, vacancies, applications |
| `admin.html` | Moderation, verifications, reports, representative assignments, announcements, jobs oversight |
| `profile.html` | Name, password, verified scopes, contributions, representative request |
| `login.html`, `register.html`, `forgot-password.html`, `reset-password.html` | Account flows |
| `employee-verification.html`, `submit-salary.html`, `submit-review.html`, `interview-experience.html` | Verification and contribution |
| `about.html`, `faq.html`, `privacy.html`, `terms.html`, `security.html`, `contact.html` | Project information and policies |

Every page carries the site-identity statement and non-affiliation disclaimer,
a skip link, the announcement bar, the notification bell when signed in, and
the Saple Guide. See [`frontend/README.md`](frontend/README.md).

---

## Tests

From `backend/`:

```bash
npm test                        # unit and HTTP tests, no database needed
npm run test:integration        # live: original workflows against a prepared database
npm run test:integration:jobs   # live: representatives, jobs, notifications, announcements
npm run diagnose:smtp -- you@example.com   # sends one real test email
```

From `ml/`: `python -m unittest discover -s tests -v`.

The unit suite covers PostgreSQL parameterization, authorization and IDOR,
cross-company denial, immediate revocation, transaction rollback, job and
application rules, notification ownership, AI scope and privacy, password
recovery, security headers and CSP, CORS on ports 5500/5501, JSON error
handling, service-worker privacy, frontend DOM safety and accessibility hooks,
migration safety and fresh-install parity, and ERD freshness.

Both live workflows were run against an in-process PostgreSQL engine (PGlite)
loaded with the final schema and demo data, and both passed. They still need a
run against the real Supabase project.

---

## Security

What was done, in short (full detail in
[`docs/security-and-safe-deployment.md`](docs/security-and-safe-deployment.md)):

- A remote company-logo fetcher, which let database content choose external
  hosts for the browser to contact, was removed; marks are generated locally.
- No third-party script, stylesheet, font, image, iframe or tracker is loaded.
- Explicit headers on every response: a self-only CSP with no `unsafe-inline`
  or `unsafe-eval`, `frame-ancestors 'none'`, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS over
  HTTPS only, and `no-store` on the API.
- All dynamic content is rendered with `textContent`; there is no `innerHTML`,
  `eval` or `new Function` anywhere.
- Body size limits, per-endpoint rate limits, no open redirects, and an AI
  guide that calls one fixed provider URL rather than acting as a relay.
- Password recovery gives one answer for every address, stores only token
  hashes, and revokes other sessions on reset.
- Nodemailer upgraded to a patched release; `npm audit --omit=dev` is clean.
- Tracked files and full git history were scanned for secrets; every match was
  a documentation placeholder.

---

## What still needs your accounts

None of these can be done or verified from the repository.

1. **Migrations** — apply `001`–`004` to a backup project, run the validation
   script (expect 21 tables, 5 views), then apply to the live project.
2. **Live tests** — run both `npm run test:integration*` commands against the
   migrated project.
3. **Email** — configure SMTP, run `npm run diagnose:smtp -- <your address>`,
   and confirm the message arrives (check spam).
4. **AI guide** (optional) — set the `AI_*` variables and follow the checks in
   [`docs/ai-assistant-setup.md`](docs/ai-assistant-setup.md).
5. **Accounts** — promote your own administrator account in the SQL editor;
   create representative and demo accounts privately.
6. **New Render service** — from the cleaned commit, never the deleted
   service. Enter every secret privately.
7. **Google Search Console** — verify the new domain, read the Security Issues
   report, fix anything listed, and request a review only when clean.

Steps 6 and 7 are written out in full, with smoke tests, in
[`docs/security-and-safe-deployment.md`](docs/security-and-safe-deployment.md).
No code change guarantees Google's approval.

---

## Presentation sequence

1. Homepage: the identity badge, the trust model, live counts.
2. Company profile with both salary ranges and their contribution counts.
3. Register an employee; request verification for a company and role.
4. As that company's representative, verify it; show the employee's
   notification.
5. Submit a salary; show it stays `PENDING` and changes no public range.
6. As admin, approve it; show the moderation history and the updated range.
7. As representative, publish a vacancy; as a job seeker, apply; shortlist it;
   show the applicant's notification and history.
8. As representative, try a URL for another company's application — refused.
9. As admin, revoke the representative; the workspace closes on the next click.
10. Publish an announcement; show the bar; hide it.
11. Ask the Saple Guide a Saple question, then for its system prompt — refused.
12. Show `ERD.pdf` and the response headers of any page.

A longer script is in [`docs/project_notes.md`](docs/project_notes.md).

---

## Known limitations

- No document, CV or file uploads anywhere, by design.
- Employment verification records a company email or proof reference; no
  one-time code is actually sent to a company mailbox.
- The Saple Guide is guidance only and can be wrong; it cannot see accounts or
  change data.
- Rate limits live in process memory: fine for one instance, not for several.
- Sign-in messages distinguish an unknown address from a wrong password (a
  usability choice that reveals whether an address is registered). Password
  recovery does not.
- Free hosting tiers sleep after inactivity and free AI tiers rate-limit; the
  first request after a pause can be slow.
- The ML prototype in `ml/` is standalone and not wired into the application.

---

## Documentation map

| Document | For |
|----------|-----|
| [`docs/security-and-safe-deployment.md`](docs/security-and-safe-deployment.md) | Remediation, new Render service, Search Console, smoke tests |
| [`docs/upgrade-audit-and-handover.md`](docs/upgrade-audit-and-handover.md) | Baseline audit findings and verification record |
| [`docs/relational_schema.md`](docs/relational_schema.md) | Tables, constraints, cardinalities, transitions |
| [`docs/ERD.md`](docs/ERD.md) | Generated ERD (Mermaid) |
| [`docs/requirement_analysis.md`](docs/requirement_analysis.md) | Actors and functional requirements |
| [`docs/email-setup-and-test.md`](docs/email-setup-and-test.md) | SMTP setup and the delivery diagnostic |
| [`docs/ai-assistant-setup.md`](docs/ai-assistant-setup.md) | Saple Guide provider configuration |
| [`docs/deployment.md`](docs/deployment.md) | Supabase connection and Render mechanics |
| [`docs/supabase_setup.md`](docs/supabase_setup.md) | Fresh Supabase project setup |
| [`docs/github-repository-settings.md`](docs/github-repository-settings.md) | Suggested repository description, topics and licence decision |
| [`database/postgres/migrations/README.md`](database/postgres/migrations/README.md) | Migration order and safety |
