# 🌱 Saple

**Company and career insights you can actually trust.**

Saple brings company profiles, salaries, workplace reviews, interview experiences and job openings into one place, and shows how far each piece of information can be trusted: who verified it, and whether a moderator approved it.

[![CI](https://github.com/mdraihankabirsifat/Saple/actions/workflows/ci.yml/badge.svg)](https://github.com/mdraihankabirsifat/Saple/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)

### 🌐 Live demo: [saple.www-raihankabireusc.workers.dev](https://saple.www-raihankabireusc.workers.dev/)

> **Academic project.** Saple is a BUET CSE216 Database Sessional project. It is not affiliated with, or an official service of, any company it lists, and the people, salaries, reviews and vacancies in the demo data are synthetic.

<img src="assets/screenshots/homepage.webp" alt="Saple homepage with the headline 'Know the company before you join', a company search bar and live site statistics" width="100%">

## Overview

Job seekers usually piece together company information from scattered, unverifiable sources. Saple keeps it in one place and is honest about where each number came from.

Anyone can browse companies, salaries, reviews, interviews and jobs. Employees can contribute, but only for the exact company and role they have been verified for, and nothing becomes public until an administrator approves it. Salaries are shown as two separate ranges: a **Verified** range from verified contributors, and a wider **Community** range from all approved submissions, each with its contribution count.

Around that core, Saple has professional profiles, member and company search, direct messaging, notifications, job applications, company representatives and an AI helper, the Saple Guide. An optional prepaid **Saple Premium** plan adds career tools on top; the free site stays complete without it.

## Features

<table>
<tr>
<td width="50%" valign="top">

**Career insights**
- Company profiles with ratings and benefits
- Verified and community salary ranges by role
- Moderated workplace reviews and interview experiences
- Jobs published by company representatives, with applications and status tracking

</td>
<td width="50%" valign="top">

**Professional network**
- Public profiles with headline, about, experience, education and skills
- Search for members and companies from any page
- Live company suggestions in the homepage search
- Private direct messages between members

</td>
</tr>
<tr>
<td width="50%" valign="top">

**Trust and verification**
- Employee verification for one company and role at a time
- Nothing is public until an administrator approves it
- Company representatives manage their own companies only
- Reports, and an audited history of every moderation decision

</td>
<td width="50%" valign="top">

**Platform**
- Notifications and site-wide announcements
- Password recovery through a single-use emailed link
- Profile pictures and company logos in Supabase Storage
- Saple Guide: AI help with a built-in fallback
- Responsive light and dark themes with subtle motion

</td>
</tr>
</table>

## Saple Premium

Saple Premium is an optional, prepaid plan. Everything that was free stays free.

| Plan | Price | Access |
|---|---|---|
| Free | ৳0 | Always |
| Premium 1 Month | ৳120 | 30 days |
| Premium 3 Months | ৳300 (save ৳60) | 90 days |
| Free trial | ৳0 | 24 hours, once per account, no card required |

Prepaid access · no automatic renewal. Buying again adds the new days after the current Premium ends.

**What Premium adds:** advanced Saple Guide answers, PDF export from the Resume Generator, full interview questions (free visitors see a short preview), Premium-only job openings (free visitors see a teaser and cannot apply), a boosted place in the representatives' Discover Talent list, a Premium badge, and the names of members who viewed your profile (the count is free). Every signed-in member can use the Resume Generator to draft text from facts they provide.

Job applications may include an optional PDF resume, up to 2 MB. The PDF is stored privately in PostgreSQL with the application. The applicant and active representatives of the hiring company can view or download it; ordinary application lists return file metadata only. Run `database/postgres/migrations/010_job_application_resumes.sql` in Supabase SQL Editor before deploying this feature. The optional `database/postgres/07_balance_demo_salary_ranges.sql` adds only synthetic community salary observations to existing bulk demo data; review it before running it.

**How payment works.** Checkout records the payment first, then opens an SSLCommerz session. The browser's return from SSLCommerz is only a redirect: Premium is granted after Saple validates the transaction with SSLCommerz's validation API (`val_id`), checks the transaction id and amount, and settles it once under a row lock. A repeated return or IPN never adds days twice. Promo and referral codes are checked and priced on the server; the browser never decides a price.

> **Payments are in SSLCommerz sandbox mode only.** No production merchant account is configured and no real money is processed. Production payments are not live.

**Setting it up**

1. Run `database/postgres/migrations/009_premium_subscriptions.sql` in the Supabase SQL Editor before deploying the Premium backend. It is additive and re-runnable, and existing vacancies stay free.
2. Optionally, run `database/postgres/06_premium_demo_content.sql` after migration 009 to mark about a third of the synthetic bulk demo vacancies as Premium. It never selects a real vacancy.
3. The non-secret settings (`PAYMENT_GATEWAY`, the SSLCommerz sandbox session and validation hosts, `PUBLIC_API_ORIGIN`, `PREMIUM_AI_MODEL` and the daily limits) are in `wrangler.jsonc`, and listed in `backend/.env.example` for local runs. The store credentials are Cloudflare secrets: `npx wrangler secret put SSLCOMMERZ_STORE_ID` and `npx wrangler secret put SSLCOMMERZ_STORE_PASSWORD`. Without them the pricing page still works and checkout says online payment is not available yet.

4. Run `database/postgres/migrations/011_ml_moderation.sql` manually after 010 if you want ML screening. It is additive and is never run by deploy scripts. ML starts disabled and in shadow mode; set `ML_SERVICE_URL` and the private `ML_SERVICE_TOKEN` only after deploying the separate Python service and reviewing the read-only training audit.

## Screenshots

### Explore companies and careers

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screenshots/companies.webp" alt="Company directory with filters and company cards showing ratings, location and community pay" width="100%">
<br><sub><b>Company directory</b>: search, filter and sort.</sub>
</td>
<td width="50%" valign="top">
<img src="assets/screenshots/company-details.webp" alt="Company page showing the Verified Salary Range per role with minimum, maximum, average and contribution count" width="100%">
<br><sub><b>Company details</b>: verified and community salary ranges.</sub>
</td>
</tr>
</table>

### Search and connect

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screenshots/home-search.webp" alt="Homepage search showing live company suggestions for the word bank" width="100%">
<br><sub><b>Homepage search</b>: company suggestions while you type.</sub>
</td>
<td width="50%" valign="top">
<img src="assets/screenshots/global-search.webp" alt="Navigation search results grouped into People and Companies" width="100%">
<br><sub><b>Global search</b>: people and companies from any page.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="assets/screenshots/professional-profile.webp" alt="Member profile with headline, about, experience, education, skills and a Message button" width="100%">
<br><sub><b>Professional profile</b>: experience, education and skills.</sub>
</td>
<td width="50%" valign="top">
<img src="assets/screenshots/messages-guide.webp" alt="Messages and Saple Guide panel open on a conversation with a company representative" width="100%">
<br><sub><b>Messages and Saple Guide</b>: one panel for both.</sub>
</td>
</tr>
</table>

### Work and moderate

<table>
<tr>
<td width="50%" valign="top">
<img src="assets/screenshots/jobs.webp" alt="Jobs page listing open vacancies with salary, work mode and application deadline" width="100%">
<br><sub><b>Jobs</b>: published vacancies still inside their deadline.</sub>
</td>
<td width="50%" valign="top">
<img src="assets/screenshots/admin-dashboard.webp" alt="Administrator moderation workspace with the pending queue and a salary submission's details" width="100%">
<br><sub><b>Admin moderation</b>: review queue with full submission context.</sub>
</td>
</tr>
</table>

<sub>Public pages were captured from the live site. The profile, messages, jobs, search and admin views use the synthetic demo accounts.</sub>

## Database design

The database is the heart of the project. It runs on **PostgreSQL**, hosted by **Supabase**.

| | |
|---|---|
| Tables | **39**, covering accounts and profiles, verification and representatives, company reference data, contributions and moderation, jobs and private application resumes, Premium subscriptions, admin audit and ML screening audit |
| Views | **7** public and training read models, including approved salary summaries and provisional visibility |
| Keys and constraints | 70 foreign-key references, 154 named `CHECK` constraints, unique and partial-unique keys |
| Indexes | 57 explicit indexes, including partial and case-insensitive unique indexes |
| Migrations | **12** additive migrations from the original 14-table schema |
| ERD | [`ERD.pdf`](ERD.pdf) and [`docs/ERD.md`](docs/ERD.md), generated from the schema file |

Some design choices worth pointing out:

- **Supertype and subtypes.** `submissions` holds what every contribution shares; `salary_submissions`, `company_reviews` and `interview_experiences` hold the rest, one-to-one on the same key.
- **Many-to-many links** such as `company_benefits` and `user_skills`, with a shared, case-insensitive skill catalogue.
- **Audit tables** (`moderation_actions`, `job_application_status_history`, `representative_assignment_actions`) use `ON DELETE RESTRICT`, so history cannot be deleted by accident.
- **Database-side logic:**
  - a trigger function, `saple_set_updated_at()`, with seven `BEFORE UPDATE` triggers;
  - a statistics function, `saple_company_insight_summary()`, that counts approved data only;
  - a procedure, `saple_apply_application_decision()`, that updates an application and writes its history row together.
- **Explicit transactions.** Every write runs inside `BEGIN … COMMIT`, with `SELECT … FOR UPDATE` where two requests could race.
- **Scoped access.** Every protected request reloads the account's role, status and company scopes from the database, so a revoked permission takes effect on the next click.

Details: [`docs/relational_schema.md`](docs/relational_schema.md) and [`docs/cse216-final-compliance.md`](docs/cse216-final-compliance.md).

## Architecture

```text
Browser  (static pages, strict Content-Security-Policy)
   │
   ▼
Cloudflare Worker  ── serves frontend/ as static assets
   │
   ▼
Express app  (route → controller → service → repository)
   │  parameterized SQL through pg
   ▼
Cloudflare Hyperdrive  (connection pooling)
   │
   ▼
Supabase PostgreSQL
```

Alongside the database:

- **Supabase Storage** holds profile pictures and company logos.
- **SMTP** (Gmail, through Nodemailer) sends password recovery emails.
- **Groq**, or any OpenAI-compatible API, answers Saple Guide questions through the backend.

The backend is written in layers. Routes only map URLs, controllers handle HTTP, services hold the rules and authorization, and repositories are the only place SQL is written, always with `$1`-style parameters and never string-built. The browser never talks to the database or holds a database credential, and authentication is Saple's own (JWT), not Supabase Auth.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, vanilla JavaScript modules; no build step, no third-party scripts |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL on Supabase |
| Database connection | `pg`, through Cloudflare Hyperdrive in production |
| Hosting | Cloudflare Workers (static assets and the API) |
| Storage | Supabase Storage |
| Authentication | JWT and bcrypt |
| Email | Nodemailer with Gmail SMTP |
| AI | Groq (OpenAI-compatible API) |

The [`ml/`](ml/) folder contains the separately deployed moderation-risk service and read-only training workflow. Worker screening starts disabled and in shadow mode; human moderation remains final, and private messages, verification evidence and applicant resumes are excluded.

## Project structure

```text
Saple/
├── backend/            Express API
│   ├── config/         database, auth, storage, mail and AI settings
│   ├── controllers/
│   ├── middleware/     authentication, rate limits, security headers
│   ├── repositories/   all SQL lives here
│   ├── routes/
│   ├── services/
│   └── tests/
├── cloudflare/         Worker entry point
├── database/postgres/  schema, demo data, validation queries, migrations/
├── docs/               setup, deployment, schema and compliance documents
├── frontend/           pages, css/, js/, assets/, service worker
├── ml/                 moderation service, training audit and candidate models
├── assets/screenshots/
├── ERD.pdf
├── render.yaml
└── wrangler.jsonc
```

## Quick start

You need Node.js 22 or newer and a PostgreSQL database, such as a Supabase project.

```bash
git clone https://github.com/mdraihankabirsifat/Saple.git
cd Saple/backend
npm ci
cp .env.example .env    # then set DATABASE_URL and JWT_SECRET
npm start
```

Open <http://localhost:3000>; one Express server serves both the pages and the API. Every setting is described in [`backend/.env.example`](backend/.env.example), and database setup is in [`docs/supabase_setup.md`](docs/supabase_setup.md).

With Docker Desktop running, `npm run local:up --prefix backend` starts the app with its own seeded PostgreSQL, no Supabase needed.

## Deployment

**Production:** Cloudflare Workers, with Hyperdrive in front of Supabase PostgreSQL.
**Live URL:** <https://saple.www-raihankabireusc.workers.dev/>

The same code still runs as a plain Node server locally, in Docker, and on Render through [`render.yaml`](render.yaml), but Render is not the current production host. For an offline demo, the Node server can also fall back to a local PostgreSQL database.

See [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md), and [`docs/deployment.md`](docs/deployment.md) for Render.

## Security

- Passwords are stored as bcrypt hashes; sessions use signed JWTs, and logging out revokes the token server-side.
- Password reset links are single-use, expire, and are stored only as hashes.
- Sign-in, recovery, search, messages and the Saple Guide are rate-limited.
- All SQL is parameterized; authorization is checked on the server for every request.
- Pages load no third-party code and run under a strict Content-Security-Policy with security headers; dynamic text is rendered as text, never as HTML.
- Secrets live in environment variables and Cloudflare secrets, never in the frontend or the repository.
- Premium is granted only after server-side SSLCommerz validation, with the amount and transaction checked and settled once; card and mobile-wallet details never reach Saple.

More in [`docs/security-and-safe-deployment.md`](docs/security-and-safe-deployment.md).

## Testing

```bash
npm test --prefix backend    # unit, HTTP and database tests (PGlite); no external database needed
npm run cf:dry-run           # builds the Cloudflare Worker bundle without deploying
```

GitHub Actions runs the backend suite, the ML tests and a set of security checks on every push.

## Documentation

- [`docs/cse216-final-compliance.md`](docs/cse216-final-compliance.md): course requirements mapped to code, database objects and tests
- [`docs/relational_schema.md`](docs/relational_schema.md) and [`docs/ERD.md`](docs/ERD.md): tables, constraints and relationships
- [`docs/requirement_analysis.md`](docs/requirement_analysis.md): requirements and scope
- [`docs/supabase_setup.md`](docs/supabase_setup.md) and [`database/postgres/migrations/README.md`](database/postgres/migrations/README.md): database setup and migrations
- [`docs/cloudflare-deployment.md`](docs/cloudflare-deployment.md) and [`docs/deployment.md`](docs/deployment.md): hosting
- [`docs/ai-assistant-setup.md`](docs/ai-assistant-setup.md) and [`docs/email-setup-and-test.md`](docs/email-setup-and-test.md): Saple Guide and email
- [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md): API and frontend details

## License

This repository has no open-source license. Saple is an independent BUET CSE academic project and is not an official service of any company it lists.
