# Saple Requirement Analysis

## Project Purpose

Saple is a BUET CSE database project for trustworthy company research. It helps graduates and job seekers compare company profiles, benefits, salary ranges, moderated workplace reviews, and interview experiences.

## Users and Authorization

- Public visitors browse approved information without an account.
- `NORMAL` users can report visible content but cannot contribute workplace data without a separate employee profile and verified scope.
- `EMPLOYEE` users can request company-and-designation verification and contribute only within an active exact scope.
- `ADMIN` is an independent `account_role`; public registration can never grant it.
- Suspended or deactivated accounts cannot authenticate or continue using an existing token.

## Implemented Functional Requirements

1. Register normal or current/former employee accounts and store only BCrypt password hashes.
2. Log in with normalized email and receive an expiring, issuer/audience-bound JWT.
3. Request a rate-limited email password-reset link and atomically consume its temporary hashed token.
4. Search and browse companies, details, benefits, and job roles.
5. Display Verified and Community salary ranges calculated from approved database rows.
6. Submit salary, review, and interview contributions as atomic parent/subtype transactions.
7. Keep every new contribution `PENDING` until ADMIN moderation.
8. Approve, reject, or flag through an atomic status-update plus immutable audit action.
9. Request company-and-designation employment verification and let ADMIN inspect that designation before verifying or rejecting it.
10. Publish only approved reviews/interviews and enforce anonymous public display.
11. Let authenticated users report concrete public review/interview submissions once.
12. Let ADMIN inspect, review, resolve, or dismiss reports and moderate the target through the audited submission workflow.

Benefits are maintained as reference/sample data in the current project; there is no public benefit-submission workflow.

## Verification Requirements

- Verification for one company never implies verification for another, and one designation never implies another designation at the same company.
- Contribution authorization requires the authenticated user, that user's employee record, exact company, exact role, `VERIFIED` status, future/no expiry, and an active account.
- ADMIN is independent from EMPLOYEE; ADMIN status alone grants no contribution access.
- Current employees use the `COMPANY_EMAIL_OTP` concept and store only company-email metadata; actual OTP delivery and values are not implemented or stored.
- Former employees use the `DOCUMENT` concept and store only a short proof type plus safe external/reference token; raw files and national identifiers are not stored.
- Pending requests have no reviewer or review timestamp.
- ADMIN decisions record reviewer and timestamp; rejection requires a reason, and verified requests expire after 12 months.
- Only future contributions matching the exact active company-role scope inherit verified status. Legacy verification rows with no safely inferred role authorize nothing until corrected or re-requested.

## Publication and Salary Rules

Only `APPROVED` submissions are public. Anonymous rows retain their internal `user_id` for accountability but expose no public identity.

The Verified Salary Range requires both:

- `submission_status = 'APPROVED'`
- `verification_status = 'VERIFIED'`

The Community Salary Range includes every approved salary, verified or unverified. Ranges and review averages are calculated by queries/views rather than stored redundantly.

## Reporting and Moderation Rules

- A reporter may create at most one report per submission.
- Reports move from `OPEN` to `REVIEWING`, `RESOLVED`, or `DISMISSED`; terminal states record resolver, time, and note.
- Submission transitions use the moderation service exclusively, with `SELECT ... FOR UPDATE`, a status update, and a `MODERATION_ACTIONS` insert in one transaction.
- Public approved content may be flagged/rejected after a report, which removes it from public results while retaining its audit history.

## Nonfunctional Requirements

- Oracle SQL is isolated in repositories and uses bind variables and explicit projections.
- Multi-step writes commit only after every step succeeds and roll back on failure.
- Public APIs omit passwords, private evidence, reporter identity, internal notes, and raw Oracle errors.
- Oracle stores only password-reset token hashes; delivery failure and token consumption have explicit rollback boundaries.
- The responsive Vanilla JavaScript frontend supports keyboard focus, semantic labels, live status messages, reduced motion, desktop filter sidebars, and mobile filters above results.

## Deferred Post-Core Scope

Real employment-verification OTP delivery, uploaded document storage, runtime ML/backend/admin integration, recommendation systems, advanced analytics, cloud deployment, shared rate limiting, and production session revocation are outside core completion. A standalone minimal ML decision-support prototype is implemented; it requires at least 50 final moderator-reviewed historical records per role, must not treat synthetic seed data as trustworthy training data, and leaves final authority with humans.
