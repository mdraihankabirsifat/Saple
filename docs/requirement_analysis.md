# Saple Requirement Analysis

## Project purpose

Saple is an independent BUET CSE academic project for company and career
insights. It helps graduates and job seekers compare company profiles,
benefits, salary ranges, moderated workplace reviews, interview experiences
and job postings, and it shows how trustworthy each piece of information is.

Saple is not affiliated with, endorsed by, or an official login or careers
service for any company it lists.

## Actors and authorization

| Actor | Can | Cannot |
|-------|-----|--------|
| Public visitor | Browse approved companies, salaries, reviews, interviews, published jobs, FAQ, policies and announcements; use the Saple Guide | Anything that needs an account |
| Normal user (job seeker) | Manage own profile and password; apply to published jobs once each; view and withdraw own applications; report public content once; receive private notifications; request a representative assignment | Contribute workplace data; reach employee, representative or admin operations |
| Employee user | Everything a normal user can; request verification for an exact company and role; after verification, contribute salary, review and interview data for exactly that scope | Contribute outside a verified scope |
| Company representative | Review verification requests, manage vacancies and review applications for **assigned, active companies only** | See another company's employees, evidence, jobs, applications or reports; reach admin queues; apply to jobs |
| Administrator | Moderate contributions, triage reports, oversee and decide verifications, approve/reject/revoke representative assignments, manage announcements, oversee all jobs and applications | Contribute workplace data by virtue of being admin |

Rules that hold for every actor:

- Public registration always creates `account_role = 'USER'`. It can never
  create an `ADMIN` or `COMPANY_REPRESENTATIVE`.
- There can be any number of administrators and representatives; none is
  hard-coded.
- Every protected request reloads account status, role, token version and
  active representative scopes from PostgreSQL. A JWT's role claim is never
  trusted alone. Suspended, deactivated, logged-out and revoked sessions stop
  working on the next request.
- Every privileged decision records the actor, previous state, new state,
  reason or note, target and timestamp.

## Functional requirements (implemented)

### Accounts
1. Register normal or current/former employee accounts; store only BCrypt
   password hashes.
2. Sign in with a normalized email and receive an expiring, issuer- and
   audience-bound JWT.
3. Request a password-reset email. The answer is identical whether or not the
   address is registered. The link is single-use, expires (default 15 minutes)
   and is stored only as a SHA-256 hash; using it revokes other sessions.
4. Change display name and password from the profile page.

### Browsing
5. Search and browse companies, details, benefits and job roles.
6. Display Verified and Community salary ranges computed from approved rows.
7. Browse approved reviews and interview experiences with filters.
8. Browse published, in-deadline jobs filtered by company, role, location,
   work mode, employment type and search text, with pagination.
9. See live public counts on the homepage, from real aggregates only.

### Contributions and moderation
10. Submit salary, review and interview contributions as atomic parent/subtype
    transactions, only within an active verified scope.
11. Keep every new contribution `PENDING` until an administrator decides it.
12. Approve, reject or flag through one transaction that updates the status,
    appends a moderation action and notifies the contributor.
13. Report a public contribution once per account; administrators resolve or
    dismiss with a note and the reporter is notified of the outcome.

### Verification
14. Request verification for an exact company and role.
15. An active representative of that company, or an administrator, verifies
    or rejects it with a required reason on rejection; the employee is notified
    in the same transaction.

### Representatives
16. A signed-in account requests a company scope with a written justification;
    this creates only a `PENDING` assignment.
17. An administrator approves, rejects or revokes it with an audited decision.
    Approval grants the representative role; the last revocation removes it and
    forces re-authentication.

### Jobs and applications
18. Representatives create, edit, publish, close and archive vacancies for
    their assigned companies only.
19. Job seekers apply once per vacancy before its deadline with a written
    statement; there is no file upload.
20. Representatives move applications through reviewer states with notes;
    applicants can withdraw while a decision is still open.
21. Every application status change writes immutable history and notifies the
    applicant; a new application notifies every active representative of that
    company; closing a vacancy notifies open applicants and keeps every
    application.
22. Administrators can see and close any vacancy for safety.

### Notifications and announcements
23. Private notifications with a paginated list, unread count, mark-one-read
    and mark-all-read, always scoped to the signed-in account.
24. Administrators publish plain-text announcements with a severity and a
    schedule; the public endpoint returns only those inside their window.

### Saple Guide
25. A bottom-right help panel answers questions about using Saple from a fixed
    knowledge base, optionally through one configured AI provider, and refuses
    out-of-scope, credential, private-data and act-for-me requests.

## Verification rules

- Verification for one company never implies another; one role never implies
  another role at the same company.
- Contribution authorization requires the authenticated user, that user's
  employee record, exact company, exact role, `VERIFIED` status, an unexpired
  or null `expires_at`, and an active account.
- A representative scope is not an employee verification. Holding the
  representative role for a company grants no contribution rights there.
- Current employees use the `COMPANY_EMAIL_OTP` method: only the company email
  address is stored; no code is sent or stored.
- Former employees use the `DOCUMENT` method: only a short proof type and a
  safe reference are stored; no file is uploaded and no national identifier is
  kept.
- Evidence is visible only to the assigned company's active representatives
  and to administrators, never publicly.

## Publication and salary rules

Only `APPROVED` submissions are public. Anonymous rows keep their internal
`user_id` for accountability but expose no public identity.

- **Verified Salary Range:** `submission_status = 'APPROVED'` and
  `verification_status = 'VERIFIED'`.
- **Community Salary Range:** every `APPROVED` salary.

Both show their contribution count. Ranges and averages are computed by views
and queries, never stored.

## Non-functional requirements

- **Architecture:** Express + PostgreSQL (Supabase) + vanilla HTML, CSS and
  JavaScript, in routes → controllers → services → repositories layers. No ORM.
- **SQL safety:** every query is parameterized (`$1`, `$2`, …) with explicit
  column lists. Raw driver errors never reach a client.
- **Atomicity:** every multi-step write, including its audit row and any
  notification, commits together or rolls back together.
- **API shape:** every `/api` response, including 404, 413, 429 and 500, uses
  `{ success, message, data? }` with `application/json`.
- **Browser safety:** strict self-only CSP, no third-party resources, no
  `innerHTML`, clickjacking protection, HSTS over HTTPS.
- **Abuse limits:** per-endpoint rate limits on every write-heavy public
  endpoint (per process).
- **Accessibility:** semantic landmarks, skip links, labels, `aria-live`
  regions, keyboard-operable tabs and dialogs, 44px touch targets, status shown
  by text and shape as well as colour, and reduced motion honoured throughout.
- **Offline:** public GET data only may be cached in the browser; private data
  never is.

## Out of scope

Real OTP delivery to company mailboxes, document or CV uploads, payments,
social login, scraping, advertising, recommendation engines, shared
(multi-instance) rate limiting, and a database chat log for the Saple Guide.

A standalone ML decision-support prototype exists under `ml/`. It is not wired
into the running application, requires at least 50 moderator-reviewed
historical records per role before training, must not treat synthetic seed
data as trustworthy, and never replaces a human decision.
