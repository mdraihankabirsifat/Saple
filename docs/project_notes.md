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

## Presentation-Day Demo Sequence

Before presenting, register a dedicated local demo account through the UI, promote only that row with your Oracle client, then sign out and sign back in so the dashboard reflects the current role:

```sql
UPDATE users
SET account_role = 'ADMIN', updated_at = SYSTIMESTAMP
WHERE email = 'your-registered-demo-email@example.test';
COMMIT;
```

Do not commit the demo password, its generated hash, or local credentials.

1. Open the homepage and search for a company.
2. Show its details, benefits, and Verified/Community salary ranges.
3. Register and log in with a temporary contributor account.
4. Submit a salary and show that it starts `PENDING` and does not change public aggregates.
5. Use the ADMIN dashboard to inspect and approve it; show the new `MODERATION_ACTIONS` row and updated Community range.
6. Explain that only an active company-specific verification also changes the Verified range.
7. With an employee account, request verification and demonstrate an ADMIN verify/reject decision.
8. Submit and approve an anonymous review, then show its public card and rating aggregate without contributor identity.
9. Submit and approve an anonymous interview experience, then show its public card.
10. Report one public card, mark the report reviewing, inspect and flag/reject the target through submission moderation, then resolve the report.

## Recommended Report Screenshots

- Homepage and company search
- Company profile with benefits and both salary ranges
- Registration/login and one contribution form
- Pending submission queue and subtype detail
- Moderation confirmation plus immutable history
- Employee verification request and ADMIN verification card
- Approved anonymous review and interview cards
- Report dialog and ADMIN report-resolution controls
- Oracle schema/ERD and representative `04_test_queries.sql` results
