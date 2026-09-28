# CSE 216 60% Compliance

| Requirement | Implementation | Files | Demo method | Status |
| --- | --- | --- | --- | --- |
| Authentication | NORMAL, EMPLOYEE, and internally provisioned ADMIN accounts share registration/login infrastructure | `backend/services/auth.service.js`, `backend/routes/auth.routes.js` | Register, login, call `/api/auth/me` | Implemented |
| Password hashing | BCrypt with 12 rounds; hashes only are stored | `backend/services/auth.service.js` | Compare database hash with submitted password | Implemented |
| JWT/session | Signed HS256 JWT with issuer, audience, expiry, user ID, role, and token version | `backend/config/auth.js`, `backend/middleware/authenticate.js` | Login and inspect safe claims | Implemented |
| Real logout | Protected logout increments database `token_version`; old JWT then fails | `backend/services/auth.service.js`, `backend/repositories/user.repository.js` | Reuse the exact token after logout | Implemented |
| Role persistence | Protected requests reload current role/status/version from PostgreSQL | `backend/middleware/authenticate.js` | Promote/change role and reuse an earlier valid token | Implemented |
| Role separation | ADMIN middleware and exact employee verification are independent | `backend/middleware/requireAdmin.js`, `backend/middleware/requireVerifiedEmployee.js` | USER gets 403 on ADMIN; unverified ADMIN gets 403 on contribution | Implemented |
| 401 behavior | Missing, malformed, expired, revoked, or unavailable-account tokens fail | `backend/middleware/authenticate.js` | Call `/api/auth/me` without/reusing token | Implemented |
| 403 behavior | Wrong role, scope, or owner fails server-side | middleware and auth service | USER calls ADMIN route; User B requests User A detail | Implemented |
| Object ownership | Owner-only contribution list/detail derive owner from `req.user` | `backend/routes/auth.routes.js`, `backend/services/auth.service.js`, `backend/repositories/user.repository.js` | Change `:submissionId` while logged in as another user | Implemented |
| Raw SQL | No ORM; SQL remains visible in repositories | `backend/repositories/` | Inspect repository queries and dependencies | Implemented |
| Parameterized queries | All user values use `$1`, `$2`, etc.; dynamic fragments are fixed/allowlisted | `backend/repositories/` | Run static migration tests | Implemented |
| 20%+ API | Public browse, auth, contributions, reports, verification, moderation, and profile APIs | `backend/routes/` | Exercise endpoint table in README | Implemented |
| Frontend authentication | Login, register, profile, password recovery, server logout | `frontend/js/login.js`, `register.js`, `auth.js`, `nav.js` | Use browser flows | Implemented |
| Role-aware frontend | ADMIN dashboard, verification link, verified-scope contribution controls, role display | `frontend/js/nav.js`, `frontend/profile.html`, `frontend/admin.html` | Compare NORMAL, EMPLOYEE, and ADMIN sessions | Implemented |
| Error feedback | Forms render safe backend error messages and loading states | `frontend/js/` | Trigger 400/401/403/409 cases | Implemented |
| Supabase database | `pg.Pool`, SSL option, health check, raw SQL, graceful shutdown | `backend/config/database.js`, `backend/repositories/health.repository.js` | `GET /api/health/database` | Implemented; live credentials required |
| Public hosting | One Render Node service serves static frontend and API with same-origin requests, restricted CORS, and one-hop proxy trust | `render.yaml`, `backend/app.js`, `backend/config/hosting.js`, `frontend/js/api.js` | Open `/`, `/api`, and health routes on the Render domain | Repository configuration implemented; account deployment required |
| Transactions | Contributions, moderation, verification/report decisions, and reset flow use explicit transactions | repository transaction files | Run rollback tests and live workflow | Implemented |
| Approved-only publication | Public SQL filters `submission_status = APPROVED` | browse/review/interview repositories and views | Submit pending, then approve and refresh | Implemented |
| Salary trust ranges | Verified = APPROVED + VERIFIED; Community = all APPROVED | PostgreSQL views and browse repository | Compare ranges before/after approval | Implemented |
| Anonymous display | Public author name appears only when anonymity is disabled | review/interview/browse repositories | Compare anonymous/nonanonymous approved entries | Implemented |

## Endpoint access classification

| Pattern | Classification |
| --- | --- |
| `GET /api/companies*`, `/api/salaries`, `/api/reviews`, `/api/interviews`, `/api/job-roles`, health | PUBLIC |
| `GET/PATCH /api/auth/me*`, `POST /api/auth/logout` | OWNER/authenticated identity |
| `POST /api/submissions/:submissionId/reports` | Authenticated user; reporter ID comes from token |
| Contribution POST routes | VERIFIED_SCOPE for exact company and role |
| `/api/admin/*` | ADMIN |

Company IDs on public GET routes identify public reference data. Submission IDs on ADMIN routes are protected by ADMIN middleware. Private submission details use owner checks and never expose moderation internals.

## Verification status

The local unit suite is runnable without database credentials. Live Supabase verification requires the developer’s ignored `DATABASE_URL`; absence of that secret is a test blocker, not a passing integration result.
