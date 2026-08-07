# Saple Project Notes 

## Project Idea

Saple is a trust-focused company review, salary insight, benefits, and interview-experience platform for graduates and job seekers. The name reflects starting small like a sapling and growing into a reliable career-guidance resource.

## Implemented Trust Model

- Public salary data is separated into a Verified Salary Range and a Community Salary Range.
- The Verified range uses approved, company-verified salary contributions only.
- The Community range uses all approved salaries, verified or unverified.
- Reviews and interviews are public only after ADMIN approval.
- Anonymous contributions retain internal ownership but expose no public contributor identity.
- Company-specific employee verification is reviewed by an ADMIN and expires after 12 months.
- Users can report submissions once; ADMIN users triage and resolve reports.
- Content actions reuse the locked, immutable-audit submission moderation workflow.

## Status Rules

`SUBMISSIONS.SUBMISSION_STATUS` uses `PENDING`, `APPROVED`, `REJECTED`, and `FLAGGED`. New contributions start `PENDING`. Public reads return only `APPROVED`; flagging/rejecting approved reported content removes it immediately.

`SUBMISSIONS.VERIFICATION_STATUS` uses `VERIFIED`, `UNVERIFIED`, `PENDING`, and `REJECTED`. New contributions are normally `VERIFIED` or `UNVERIFIED`, based on an active non-expired company verification.

`EMPLOYMENT_VERIFICATIONS.VERIFICATION_STATUS` uses `PENDING`, `VERIFIED`, `REJECTED`, and `EXPIRED`.

`REPORTS.REPORT_STATUS` uses `OPEN`, `REVIEWING`, `RESOLVED`, and `DISMISSED`.

## Privacy Boundary

Public responses must not expose user IDs, email addresses, verification evidence, reporter identity, or moderation internals. Company-email metadata and proof references are available only inside ADMIN verification endpoints. The project does not store raw OTPs, document uploads, national IDs, or production credentials.

## Current Scope Boundary

Authentication, salary contributions, moderation, employee verification, reviews, interviews, reporting, public display, ADMIN dashboard integration, rollback tests, and documentation are implemented. ML and deployment remain deferred.
