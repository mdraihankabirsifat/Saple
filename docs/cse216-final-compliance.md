# CSE216 final checklist: where each requirement lives

**Written for:** the Saple team defending the project, and the evaluator
checking it.

Every row below points at code you can open, a database object you can list,
and a test that exercises it. Nothing here asks you to take the documentation's
word for it.

Run the suite first, from `backend/`:

```bash
npm ci
npm test
```

---

## 1. Authentication is Saple's own code

| | |
|---|---|
| **Status** | Implemented |
| **Files** | `backend/services/auth.service.js` (BCrypt and JWT signing), `backend/middleware/authenticate.js`, `backend/utils/authorization.js`, `backend/repositories/user.repository.js` |
| **Tests** | `tests/auth.service.test.js`, `tests/authenticate.middleware.test.js`, `tests/access.routes.test.js` |

Passwords are hashed with BCrypt and verified in Saple's own service. Sessions
are JSON Web Tokens signed by the backend and checked on every request for
signature, algorithm, issuer, audience and expiry, then re-checked against the
database for account status, role and `token_version`.

There is no Firebase, Auth0, Supabase Auth, Google or Microsoft sign-in
anywhere: Supabase is only the hosted PostgreSQL server, and the browser never
receives a database credential.

**Explain it like this:** "Registration always creates an ordinary `USER`.
Administrator and company-representative authority is granted inside the
database, never by anything the browser sends. Signing out, changing a password
or being suspended raises `token_version`, so an old token stops working on its
very next request."

**Show it:**

```bash
curl -s localhost:3000/api/auth/me                       # 401, no token
curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<demo address>","password":"<demo password>"}'
curl -s localhost:3000/api/auth/me -H "Authorization: Bearer <token>"   # 200
```

## 2. Authentication is validated on every protected page and request

| | |
|---|---|
| **Status** | Implemented (backend), fixed in this pass (pages) |
| **Files** | `backend/middleware/authenticate.js`, `backend/middleware/requireAdmin.js`, `backend/middleware/requireCompanyRepresentative.js`, `backend/middleware/requireVerifiedEmployee.js`, `frontend/js/require-session.js` and the page scripts below |
| **Tests** | `tests/access.routes.test.js`, `tests/representative-scope.routes.test.js`, `tests/revocation-ownership.routes.test.js`, `tests/frontend.protected-pages.test.js` |

Every protected route runs `authenticate` plus the role, ownership or
company-scope middleware that suits it. That is the security boundary.

Each private page now also confirms the session with the server (`GET
/api/auth/me`) **before** it requests anything private, instead of trusting a
token in browser storage:

| Page | Script | Check |
|---|---|---|
| `admin.html` | `js/admin.js`, `js/admin-oversight.js` | `getCurrentUser()` / `requireSession({ roles: ['ADMIN'] })` |
| `representative.html` | `js/representative.js` | `requireSession()`, then the server decides the company scope |
| `profile.html` | `js/profile.js` | `getCurrentUser()` |
| `my-applications.html` | `js/my-applications.js` | `requireSession()` |
| `employee-verification.html` | `js/verification.js` | `getCurrentUser()` |
| `submit-salary.html`, `submit-review.html`, `interview-experience.html` | `js/contribution-access.js` | `getCurrentUser()`, then verified scopes |

`requireSession()` sends an unauthenticated visitor to `login.html` with a
`returnTo` that must be one of Saple's own pages, clears a session the server
rejects, and hands a signed-in account with the wrong role to the page's own
access-denied state.

**Deliberate exception:** browsing companies, salaries, reviews, interviews and
jobs stays public, as does every public `GET` endpoint. Saple is a public
directory; only account data is private.

**Explain it like this:** "The page check is for usability, so a visitor sees a
clear message instead of a failed request. It is not the protection. Even if
someone edited the JavaScript, every private request is still refused by the
backend middleware."

## 3. Every DML operation uses explicit transaction control

| | |
|---|---|
| **Status** | Fixed in this pass |
| **Files** | `backend/config/database.js` (`withTransaction`), every file in `backend/repositories/` |
| **Tests** | `tests/transaction-boundaries.test.js`, `tests/transaction.repository.test.js`, `tests/moderation.transaction.test.js`, `tests/core-workflows.transaction.test.js` |

Multi-step workflows already opened their own transactions with row locks.
Single-statement writes used to rely on PostgreSQL's implicit transaction, so
they now go through one helper:

```js
async function withTransaction(work, existingClient = null) {
  if (existingClient) return work(existingClient);   // join the caller's transaction
  const client = await module.exports.getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { /* logged */ }
    throw error;
  } finally {
    client.release();
  }
}
```

Writes moved onto it in this pass:

| Repository | Functions |
|---|---|
| `user.repository.js` | `updateFullName`, `updatePasswordHash`, `incrementTokenVersion` |
| `announcement.repository.js` | `createAnnouncement`, `updateAnnouncement`, `setAnnouncementActive` |
| `notification.repository.js` | `markOneRead`, `markAllRead` |
| `workflow-test.repository.js` | `updateWorkflowUser` (live-workflow script) |

A test walks every repository file and fails if any `INSERT`, `UPDATE` or
`DELETE` is issued on the pool instead of a transaction client, so this cannot
regress quietly.

**Explain it like this:** "Passing an existing client means a helper called
inside a larger workflow joins that transaction rather than opening a second
one, so a decision and the notification it triggers still commit or roll back
together."

## 4. Trigger

| | |
|---|---|
| **Status** | Added in this pass |
| **Objects** | `saple_set_updated_at()` and `trg_users_set_updated_at`, `trg_companies_set_updated_at`, `trg_submissions_set_updated_at`, `trg_company_representatives_set_updated_at`, `trg_job_postings_set_updated_at`, `trg_job_applications_set_updated_at`, `trg_announcements_set_updated_at` |
| **SQL** | `database/postgres/migrations/005_cse216_final_database_features.sql`, same objects in `01_final_schema_postgres.sql` |
| **Tests** | `tests/database-objects.test.js` |

One `BEFORE UPDATE` trigger per table that has `updated_at` sets the column on
the row being written.

**Why it belongs in the database:** the application already sets `updated_at`
in its own statements, but the application is not the only writer. A fix
applied in the Supabase SQL editor, a `psql` session, or a future repository
that forgets the column would otherwise leave a stale timestamp. `BEFORE
UPDATE` changes the row in flight, so it costs no second write and cannot
recurse.

**Show it:**

```sql
SELECT user_id, updated_at FROM users ORDER BY user_id LIMIT 1;
UPDATE users SET full_name = full_name WHERE user_id = <that id>;  -- updated_at not mentioned
SELECT user_id, updated_at FROM users WHERE user_id = <that id>;   -- it moved
```

## 5. Function returning a computed value

| | |
|---|---|
| **Status** | Added in this pass |
| **Object** | `saple_company_insight_summary(p_company_id BIGINT)`, `LANGUAGE sql STABLE` |
| **Used by** | `backend/repositories/company.repository.js` → `findCompanyInsightSummary()` → `GET /api/companies/:id` (`insights`) |
| **Tests** | `tests/database-objects.test.js` |

Returns, for one company and from approved submissions only: review count,
average rating, approved salary count, minimum, maximum and average salary,
interview count and currently open job count.

Each figure is its own scalar subquery. Joining reviews, salaries and
interviews in one `FROM` would multiply rows against each other and inflate
every count; the test compares the function against independently computed
figures and against that deliberate fan-out to show the difference.

`STABLE` because it only reads, and returns the same answer throughout one
statement, which lets the planner reuse it.

**Show it:**

```sql
SELECT * FROM saple_company_insight_summary(1);
```

Or open any company page: the same numbers arrive in the `insights` field of
`GET /api/companies/:id`.

## 6. Procedure for a multi-step workflow

| | |
|---|---|
| **Status** | Added in this pass |
| **Object** | `saple_apply_application_decision(...)` |
| **Used by** | `backend/repositories/application.repository.js` → `changeApplicationStatus()` |
| **Tests** | `tests/database-objects.test.js`, `tests/jobs-applications.test.js` |

One job-application decision has to change two tables together: the status on
`job_applications`, and a new row in `job_application_status_history`. The
procedure locks the application row (`FOR UPDATE`), refuses a transition the
caller's role may not make, writes both tables, and returns the previous
status, the new history id, the applicant and the job title through `INOUT`
parameters.

It raises two custom SQLSTATEs, which the repository maps back to the API
errors Saple already returns, so no SQL detail reaches a browser:

| SQLSTATE | Meaning | API result |
|---|---|---|
| `SA001` | application does not exist | 404 Application not found |
| `SA002` | current status not in the allowed list | 409 invalid transition |

**There is no `COMMIT` inside the procedure.** The backend opens the
transaction, calls the procedure, inserts the applicant's notification, and
commits once. If the notification fails, the decision and its history row roll
back with it — a test proves exactly that.

Authorization is unchanged and still happens before the call: the service
checks ownership, company scope or admin authority, and passes the list of
statuses that role may move from.

**Show it (disposable data only):**

```sql
BEGIN;
CALL saple_apply_application_decision(<application_id>, <actor_user_id>,
     'UNDER_REVIEW', 'demonstration', ARRAY['SUBMITTED']::VARCHAR[], TRUE,
     NULL, NULL, NULL, NULL);
SELECT application_status, reviewed_by FROM job_applications WHERE application_id = <application_id>;
SELECT previous_status, new_status FROM job_application_status_history
 WHERE application_id = <application_id> ORDER BY history_id DESC LIMIT 1;
ROLLBACK;
```

## 7. At least three complex queries

| | |
|---|---|
| **Status** | Implemented |

### 7.1 Company directory with ratings and salary spread

- **Purpose:** the Companies page: search, filter and sort companies with their approved rating and pay range.
- **File:** `backend/repositories/company.repository.js`, `findAllCompanies()`
- **Tables:** `companies`, `submissions`, `company_reviews`, `salary_submissions`, `job_roles`, `interview_experiences`
- **Complexity:** one CTE per contribution type (`WITH review_stats`, salary and interview equivalents) so the aggregates cannot multiply each other, each `LEFT JOIN`ed once; `COUNT`, `AVG`, `MIN`, `MAX`, `ROUND`; `EXISTS` subqueries for the role and salary-range filters; optional filters on name, industry, location, size and rating, plus sorting and paging.
- **Privacy:** only `submission_status = 'APPROVED'` rows count.
- **Test:** `tests/company-ratings-and-layout.test.js`
- **Show it:** `GET /api/companies?minRating=4&hasSalaryData=true`

### 7.2 Verified and community salary summaries

- **Purpose:** the two salary ranges on every company page.
- **Files:** views `vw_verified_salary_summary` and `vw_community_salary_summary` in `01_final_schema_postgres.sql`; `backend/repositories/browse.repository.js`, `findPublicSalaryInsights()`
- **Tables:** `submissions`, `salary_submissions`, `companies`, `job_roles`
- **Complexity:** `GROUP BY` company, role, currency and pay period; `MIN`, `MAX`, `AVG`, `COUNT`; `FILTER (WHERE verification_status = 'VERIFIED')` to separate the verified range from the community one; a `HAVING` clause for the salary-range filters.
- **Test:** `tests/browse.repository.test.js`
- **Show it:** `GET /api/salaries?salarySource=VERIFIED`, or the Salaries page.

### 7.3 Representative-scoped application queue

- **Purpose:** the company workspace: the applications a representative may see.
- **File:** `backend/repositories/application.repository.js`, `findApplicationsForScope()`
- **Tables:** `job_applications`, `job_postings`, `companies`, `users`
- **Complexity:** a four-table join filtered by the caller's approved company ids (`= ANY($1)`), optional job and status filters, ordering and paging, with a matching `COUNT(*)` query.
- **Privacy:** the company scope comes from the database for the current token, never from the request, so one representative cannot read another company's applicants.
- **Test:** `tests/representative-scope.routes.test.js`
- **Show it:** sign in as a representative and open the Applications tab.

### 7.4 The statistical function itself

`saple_company_insight_summary()` (section 5) is a fourth: eight aggregates
over four tables, each isolated from the others.

## 8. Features used only where appropriate

No table was added for this checklist. The trigger maintains a column the
schema already had, the function computes figures the site already shows, and
the procedure wraps a workflow that already had to touch two tables at once.
Explaining each one is the point of this page.

---

## Evaluation sequence

About ten minutes, in order:

1. **Register and sign in.** Show `auth.service.js`: BCrypt hashing, then a JWT signed by Saple. Point out that no third-party sign-in exists anywhere in the repository.
2. **Protected request.** `GET /api/auth/me` without a token gives 401; with the token it gives 200. Open `admin.html` while signed out and show the redirect to `login.html?returnTo=admin.html`.
3. **Rollback.** Run `node --test tests/transaction-boundaries.test.js` and `tests/moderation.transaction.test.js`: a forced failure leaves `commits: 0, rollbacks: 1, releases: 1`.
4. **Trigger.** Run the `UPDATE` in section 4 and show `updated_at` moving although the statement never mentions it.
5. **Function.** `SELECT * FROM saple_company_insight_summary(1);` and explain the eight aggregates and why they are separate subqueries.
6. **Procedure.** Run the `CALL` in section 6 on a disposable row, then show both tables.
7. **Complex queries.** Open the Companies page (7.1), the Salaries page (7.2) and the representative workspace (7.3).
8. **No third-party auth.** `grep -ri "firebase\|auth0\|supabase-js\|signInWith" backend frontend` returns nothing.

Everything above runs against a local or disposable database. Never
demonstrate the procedure against live data, and never show a real credential,
reset token or private submission during an evaluation.
