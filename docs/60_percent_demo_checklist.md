# CSE 216 60% Demonstration Checklist

Before the viva, apply the two PostgreSQL setup files, configure `backend/.env`, run `npm run provision:demo-users`, start backend/frontend, and run `npm test` plus `npm run test:integration`.

Keep browser DevTools or an API client open so status codes are visible.

## Demo 1 — NORMAL user

1. Sign in with the NORMAL demo account.
2. Open Profile and show account type `NORMAL`, role `USER`, and state `ACTIVE`.
3. Browse companies, salaries, reviews, and interviews.
4. Show that ADMIN dashboard controls are unavailable.
5. Call `GET /api/admin/submissions/pending` with the NORMAL token.
6. Confirm `403 Administrator access is required`.

## Demo 2 — EMPLOYEE

1. Sign in with the EMPLOYEE demo account.
2. Show its exact verified company-role scopes on Profile.
3. Submit outside that company or designation and confirm `403`.
4. Submit salary/review/interview inside an approved exact scope.
5. Confirm `201` and `submissionStatus: PENDING`.
6. Show that ADMIN status is unrelated to verified contribution scope.

## Demo 3 — ADMIN

1. Sign in with the internally provisioned ADMIN account.
2. Open the ADMIN dashboard and pending queues.
3. Review a verification request and approve or reject it.
4. Open a pending submission, approve/reject/flag it, and show moderation history.
5. Open a report and move it through review to resolution/dismissal.
6. Confirm the action and status update are recorded together.

## Demo 4 — unauthenticated

1. Remove the Authorization header.
2. Call `GET /api/auth/me`.
3. Confirm `401 Authentication is required`.

## Demo 5 — object ownership / IDOR

1. As User A, call `GET /api/auth/me/submissions`.
2. Copy one of A’s submission IDs.
3. Call `GET /api/auth/me/submissions/:submissionId` as A; confirm `200`.
4. Sign in as User B and request the exact same ID.
5. Confirm `403 You do not have access to this submission`.
6. Request a nonexistent positive ID; confirm `404`.

## Demo 6 — real logout

1. Login and save token A.
2. Call `GET /api/auth/me` with A; confirm `200`.
3. Call `POST /api/auth/logout` with A; confirm `200`.
4. Reuse exact token A on `GET /api/auth/me`.
5. Confirm `401 Authentication token has been revoked`.
6. Show that the frontend cleared its local session even if the logout network request fails.

## Demo 7 — validation and authentication errors

1. Submit an empty/malformed registration; confirm `400`.
2. Register a duplicate normalized email; confirm `409`.
3. Login with a wrong password; confirm `401`.
4. Send a malformed Bearer token; confirm `401`.
5. Show that no raw PostgreSQL error is returned.

## Demo 8 — publication workflow

1. Submit a valid contribution and record its ID.
2. Refresh the public endpoint and show the PENDING row is absent.
3. Approve it as ADMIN.
4. Refresh and show it is now public.
5. Flag/reject approved content and show it disappears immediately.

## Demo 9 — salary trust

1. Explain Community Range: every APPROVED salary.
2. Explain Verified Range: APPROVED salaries whose verification status is VERIFIED.
3. Show both values for one company/role.
4. Confirm pending, rejected, and flagged rows affect neither range.

## Demo 10 — password revocation

1. Login and save an old JWT.
2. Change the password from Profile.
3. Reuse the old JWT and confirm `401`.
4. Login with the new password.
5. Repeat with a password-reset link if SMTP is configured.

## Final visual checks

- Role/type is visible on Profile.
- My Contributions is visible only after authentication.
- Irrelevant contribution/ADMIN controls are hidden, while backend checks remain authoritative.
- Forms show safe loading, success, and error messages.
- Navigation and forms remain usable at mobile width.
- No browser console errors or broken links are present.
