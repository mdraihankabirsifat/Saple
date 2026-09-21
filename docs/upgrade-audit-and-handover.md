# Saple upgrade: audit findings and verification record

**Written for:** the Saple project owner, before committing, migrating and
redeploying.

**State at the end of this work:** all 13 phases of the brief are complete in
code, schema, tests and documentation. **Nothing has been committed or pushed,
and nothing has been deployed.**

| Check | Result |
|-------|--------|
| `npm test` (backend) | **245 passing, 0 failing** — baseline was 129 |
| ML unit tests (`python -m unittest discover -s tests`) | **6 passing** |
| `npm audit --omit=dev` | **0 vulnerabilities** — baseline had 1 high |
| `git diff --check` | clean |
| Secret scan: tracked files and full git history | no real secrets; placeholders only |
| Fresh schema vs. migrated schema on real PostgreSQL (PGlite) | **identical**: 26 relations, 262 columns, 298 constraints, 67 indexes, 5 views |
| Migrations on a copy of the old 14-table schema with demo data | applied cleanly; 116 users and 713 submissions preserved; re-runs harmless |
| Live workflow `integration.workflow.js` on PGlite | **passed** |
| Live workflow `integration.jobs-representatives.js` on PGlite | **passed** |
| Page width at a true 390 px viewport (home, jobs, sign-in) | no horizontal overflow |

---

## 1. What is left, and only you can do it

| Step | Why it cannot be done from the repository |
|------|--------------------------------------------|
| Apply migrations `001`–`004` to a backup project, then the live one | Needs your Supabase account |
| Run both `npm run test:integration*` against the migrated project | Needs `DATABASE_URL` |
| `npm run diagnose:smtp -- <your address>`, then check inbox and spam | Needs SMTP credentials and a mailbox |
| Configure `AI_*` (optional) and run the checks in `docs/ai-assistant-setup.md` | Needs a provider key |
| Promote your admin account; create representative and demo accounts | Needs the live database |
| Create a **new** Render service from the cleaned commit | Needs your Render account |
| Verify the new URL in Search Console; request review only if issues are listed and fixed | Needs your Google account |

Full instructions: `docs/security-and-safe-deployment.md`. No code change
guarantees Google's approval.

---

## 2. Baseline audit (Phase 1)

### 2.1 The baseline

| Check | Result |
|-------|--------|
| `npm test` | 129 passing |
| ML tests | 6 passing |
| `npm audit --omit=dev` | 1 high: `nodemailer <= 9.1.0` (four advisories) |
| `git diff --check` | clean |
| `git status` | clean apart from the untracked brief |
| Schema | 14 tables, 4 views |

### 2.2 Confirmed problems and what was done

**A remote logo fetcher driven by database content.**
`frontend/js/company-logo.js` built image URLs at `logos.hunter.io` and
`icons.duckduckgo.com` from each company's `website` column, so database
content decided which external host a visitor's browser contacted. Removed;
marks are generated locally. **No claim is made that this was the specific
Google Web Risk trigger** — the repository holds no evidence of what was.

**No security headers.** No CSP, framing protection, `nosniff`,
`Referrer-Policy` or `Permissions-Policy`; `X-Powered-By` advertised. All now
explicit on every response.

**No request body limit**, and malformed JSON produced an unhandled error
rather than the JSON envelope. Both fixed.

**Account enumeration in password recovery** (404 for unknown, 403 for
deactivated). Now one identical answer for every address.

**Rate limiting covered only password recovery.** Now also sign-in,
registration, reports, verification requests, job applications,
representative requests and the Saple Guide.

**The reported "invalid response" at 127.0.0.1:5501.** `frontend/js/api.js`
resolved the API base only for port 5500. From 5501 the page called itself, got
HTML, failed to parse it, and showed one vague message for every cause. Any
local port now reaches the backend on 3000, Content-Type is checked before
parsing, and eleven failure kinds are distinguished with a Retry action.

**Two `innerHTML` assignments** in `frontend/js/contribution-access.js`
(static strings, not exploitable). Replaced with safe DOM construction.

**Stale labels:** eight pages said "Supabase PostgreSQL 19c"; six linked to a
removed anchor. Corrected.

**A misplaced seed in the homepage tree** (pre-existing): an SVG `transform`
attribute combined with CSS `transform-origin` shifted it ~100 units away from
the trunk. Fixed during the visual check.

### 2.3 Checked and found clean

- No `eval`, `new Function`, `document.write`, `insertAdjacentHTML` or
  `outerHTML` in the repository.
- No inline `<style>`, `style="` or `on*=` handler in any page, so the CSP
  needs no `unsafe-inline`.
- No iframe, embed, object, video or audio element.
- **Secrets.** Every tracked file and every commit in history was scanned for
  connection strings, private keys and provider key formats. All matches were
  placeholders (`your_password`, `replace_with_database_password`,
  `${SAPLE_LOCAL_DB_PASSWORD}`) or, once, a regex inside a test assertion. No
  `.env` file was ever committed. Nothing needs remediation.

---

## 3. Defects found by running against real PostgreSQL

The SQL could not be run while it was being written (no Docker, no `psql`).
It was later run against PGlite — PostgreSQL compiled to WebAssembly — which
found two real defects in this upgrade's own work, both fixed:

1. **Identity sequences for the seven new tables were synchronised too
   early** in `02_final_demo_data_postgres.sql`, before their demo rows were
   inserted. The first real insert would have collided with demo row 1
   (`duplicate key value violates unique constraint "pk_company_representatives"`).
   The synchronisation now runs after the rows, and a test pins the order.
2. **A false claim in the migration README** that the demo-data file could be
   re-run on a migrated project. It cannot: its original section is not
   re-runnable, and its explicit IDs could attach demo rows to real accounts.
   The README now says to use it on fresh projects only.

A parameter that appeared both as an inserted value and in a `CASE`
comparison in `createJob` was also given explicit `::varchar` casts, matching
the pattern the existing repositories use.

**About the PGlite socket bridge.** Running over PGlite's wire-protocol bridge,
the original workflow failed at the step that deliberately forces a
constraint error inside a transaction. This was isolated and shown to be a
defect in the bridge, not Saple: after an error the bridge leaves the
connection one message out of step (the next read returns nothing, the one
after returns the previous answer), while the same statement sequence run
in-process behaves correctly. Both workflows were then run in-process and
passed. PGlite 0.5.8 embeds PostgreSQL 18.3; Supabase projects may run a
different major version, and PGlite is not the Supabase service itself, so the
live runs against Supabase in section 1 are still required.

---

## 4. Decisions worth knowing

- **Service name.** `render.yaml` now names the service `saple-academic` so a
  Blueprint deploy cannot reuse the flagged subdomain.
- **ERD.** Generated from the schema file by `docs/tools/build-erd.js` into
  `docs/ERD.html`, `docs/ERD.md` and the root `ERD.pdf`. The Oracle milestone
  diagram was moved, not deleted, to `docs/archive/`. A test fails if the ERD
  goes stale.
- **No Oracle parity migration.** The seven new tables exist only in
  PostgreSQL; `database/sql/` is kept unchanged as the milestone record.
- **No resume field** on applications: no uploads, no applicant-supplied URLs.
- **Sign-in messages** still distinguish an unknown address from a wrong
  password, a deliberate existing usability choice that is documented as a
  limitation. Password recovery no longer does.
- **CI runs on Node 22**, matching `Dockerfile.local`. The suite was run
  locally on Node 26 only; the first CI run is the Node 22 check.
- **No `LICENSE`** was added; see `docs/github-repository-settings.md`.

---

## 5. Suggested commits

The working tree is one large change. Suggested split:

1. `secure Saple authentication and deployment` — security headers and CSP,
   rate limits, body limits, local company marks, robots/sitemap/security.txt,
   Nodemailer upgrade, recovery enumeration fix, API base resolution,
   `render.yaml`, `.env.example`, CI.
2. `add company representatives and jobs` — migrations, schema, demo data, ERD,
   representative/job/application backend and frontend.
3. `refresh homepage and user notifications` — homepage, shared UI helpers,
   notifications, announcements, the Saple Guide, policy pages.
4. `finalize tests and project documentation` — test suites, README and `docs/`.

Do not rewrite existing history. Note that the ERD move shows as a delete plus
new files until `git add` records it as a rename.
