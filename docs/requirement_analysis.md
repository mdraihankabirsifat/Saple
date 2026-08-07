# Saple Requirement Analysis

## Project Purpose

Saple is a BUET CSE database project for trustworthy company research. It helps graduates and job seekers compare company profiles, benefits, salary ranges, moderated workplace reviews, and interview experiences.

## Users and Authorization

- Public visitors browse approved information without an account.
- `NORMAL` users can contribute salaries and interview experiences and report visible content.
- `EMPLOYEE` users can additionally request company-specific verification and submit workplace reviews.
- `ADMIN` is an independent `account_role`; public registration can never grant it.
- Suspended or deactivated accounts cannot authenticate or continue using an existing token.

## Implemented Functional Requirements

1. Register normal or current/former employee accounts and store only BCrypt password hashes.
2. Log in with normalized email and receive an expiring, issuer/audience-bound JWT.
3. Search and browse companies, details, benefits, and job roles.
4. Display Verified and Community salary ranges calculated from approved database rows.
5. Submit salary, review, and interview contributions as atomic parent/subtype transactions.
6. Keep every new contribution `PENDING` until ADMIN moderation.
7. Approve, reject, or flag through an atomic status-update plus immutable audit action.
8. Request company-specific employment verification and let ADMIN verify or reject it.
9. Publish only approved reviews/interviews and enforce anonymous public display.
10. Let authenticated users report concrete public review/interview submissions once.
11. Let ADMIN inspect, review, resolve, or dismiss reports and moderate the target through the audited submission workflow.

Benefits are maintained as reference/sample data in the current project; there is no public benefit-submission workflow.

## Verification Requirements

- Verification for one company never implies verification for another.
- Current employees use the `COMPANY_EMAIL_OTP` concept and store only company-email metadata; actual OTP delivery and values are not implemented or stored.
- Former employees use the `DOCUMENT` concept and store only a short proof type plus safe external/reference token; raw files and national identifiers are not stored.
- Pending requests have no reviewer or review timestamp.
- ADMIN decisions record reviewer and timestamp; rejection requires a reason, and verified requests expire after 12 months.
- Only future contributions inherit the active company-specific verification status.

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
- The responsive Vanilla JavaScript frontend supports keyboard focus, semantic labels, live status messages, and reduced motion.

## Deferred Post-Core Scope

Real OTP delivery, uploaded document storage, ML/risk scoring, recommendation systems, advanced analytics, cloud deployment, and production session enhancements are outside core completion.
