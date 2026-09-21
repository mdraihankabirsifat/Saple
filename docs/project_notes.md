# Saple Project Notes 

## Project Idea

Saple is an independent BUET CSE academic project: a trust-focused company review, salary insight, benefits, interview-experience and jobs platform for graduates and job seekers. The name reflects starting small like a sapling and growing into a reliable career-guidance resource.

## Implemented Trust Model

- Public salary data is separated into a Verified Salary Range and a Community Salary Range.
- The Verified range uses approved, company-verified salary contributions only.
- The Community range uses all approved salaries, verified or unverified.
- Reviews and interviews are public only after ADMIN approval.
- Anonymous contributions retain internal ownership but expose no public contributor identity.
- Exact company-and-designation employee verification is reviewed by an active company representative for that company, with administrators as oversight and fallback, and expires after 12 months.
- Users can report submissions once; ADMIN users triage and resolve reports.
- Content actions reuse the locked, immutable-audit submission moderation workflow.
- Password recovery sends a temporary single-use link while PostgreSQL retains only its SHA-256 token hash, and gives the same answer whether or not an address is registered.
- Company representatives are approved by an administrator and bound to explicit companies; they manage vacancies and applications for those companies only.
- Private notifications and public announcements are plain text, rendered with `textContent`.

## Status Rules

`SUBMISSIONS.SUBMISSION_STATUS` uses `PENDING`, `APPROVED`, `REJECTED`, and `FLAGGED`. New contributions start `PENDING`. Public reads return only `APPROVED`; flagging/rejecting approved reported content removes it immediately.

`SUBMISSIONS.VERIFICATION_STATUS` uses `VERIFIED`, `UNVERIFIED`, `PENDING`, and `REJECTED`. New contributions require an active non-expired employee/company/role verification and are created as `VERIFIED` and `PENDING` moderation rows.

`EMPLOYMENT_VERIFICATIONS.VERIFICATION_STATUS` uses `PENDING`, `VERIFIED`, `REJECTED`, and `EXPIRED`.

`REPORTS.REPORT_STATUS` uses `OPEN`, `REVIEWING`, `RESOLVED`, and `DISMISSED`.

## Privacy Boundary

Public responses must not expose user IDs, email addresses, verification evidence, reporter identity, moderation internals, or raw password-reset tokens. Company-email metadata and proof references are available only to administrators and to active representatives of the same company. The project does not store raw OTPs, document uploads, national IDs, or production credentials.

## Current Scope Boundary

Authentication, SMTP password recovery code, exact-scope contributions, moderation, employee verification, company representatives, jobs and applications, notifications, announcements, the Saple Guide, reviews, interviews, reporting, rollback tests, and documentation are implemented. The current repository exposes one consolidated schema, one consolidated demonstration-data loader, and one read-only verification script. Real SMTP delivery still requires provider credentials. The standalone ML prototype is implemented while runtime integration remains deferred. The site is not currently deployed: the previous Render service was flagged and deleted. Creating a new service requires the owner's accounts and secrets; see `docs/security-and-safe-deployment.md`.

## Presentation-Day Demo Sequence

Before presenting, register a dedicated local demo account through the UI, promote only that row in the Supabase SQL editor, then sign out and sign back in so the dashboard reflects the current role:

```sql
UPDATE users
SET account_role = 'ADMIN', token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
WHERE email = 'your-registered-demo-email@example.test';
```

Do not commit the demo password, its generated hash, or local credentials.

1. Open the homepage and search for a company.
2. Show its details, benefits, and Verified/Community salary ranges.
3. Register and log in with a temporary contributor account.
4. Submit a salary and show that it starts `PENDING` and does not change public aggregates.
5. Use the ADMIN dashboard to inspect and approve it; show the new `MODERATION_ACTIONS` row and updated Community range.
6. Explain that only an active company-specific verification also changes the Verified range.
7. With an employee account, request a company and designation; demonstrate that ADMIN sees both and that another role is rejected.
8. Submit and approve an anonymous review, then show its public card and rating aggregate without contributor identity.
9. Submit and approve an anonymous interview experience, then show its public card.
10. Report one public card, mark the report reviewing, inspect and flag/reject the target through submission moderation, then resolve the report.
11. With a second account, request a company representative scope from the profile page; approve it from the admin oversight panel; show the representative workspace for that company only.
12. As the representative, create and publish a vacancy; as a job seeker, apply; as the representative, shortlist the application and show the applicant's notification.
13. Revoke the representative scope as admin and show that the workspace closes on the next request without signing out.
14. Open the Saple Guide, ask a Saple question, then ask for the system prompt and show the refusal.

## Recommended Report Screenshots

- Homepage and company search
- Homepage seed-to-tree hero illustration and reduced-motion state
- Forgot-password request and reset-password forms
- Company profile with benefits and both salary ranges
- Registration/login and one contribution form
- Pending submission queue and subtype detail
- Moderation confirmation plus immutable history
- Employee verification request and ADMIN verification card
- Approved anonymous review and interview cards
- Report dialog and ADMIN report-resolution controls
- PostgreSQL ERD (`ERD.pdf`) and representative `database/postgres/03_schema_and_data_demo_postgres.sql` results
- Representative workspace, job board, application tracking and notification panel

## Password-recovery live diagnostic

Start the backend before testing the browser and call `POST /api/auth/forgot-password` directly. An unknown normalized email must return `200` with the same generic message a registered address receives, and must create no token row. A registered active account is proven only when configured SMTP accepts delivery (run `npm run diagnose:smtp -- <address>` first); then verify a 64-character hash, one-time link use, old/new-password login, and rollback under SMTP failure. Never print environment values or reset URLs.

The synthetic salaries/reviews in `database/postgres/02_final_demo_data_postgres.sql` are classroom presentation content, not official employer data and not trustworthy ML training history. The optional model remains decision-support only, stays inactive below 50 final moderator-reviewed historical records for a role, and never replaces the human moderator.
