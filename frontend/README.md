# Saple Frontend

Saple's frontend is a responsive, framework-free application built with HTML, CSS, and Vanilla JavaScript ES modules. The current UI preserves the established visual system while connecting account, contribution, public-display, reporting, and ADMIN workflows to the Express API.

## Running Locally

Start the backend at `http://localhost:3000`, then run from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`. A static server is required for reliable ES-module loading. `js/api.js` contains the default API base URL.

## Connected Pages

| File | Behavior |
| --- | --- |
| `index.html` | Homepage, search handoff, trust explanation, and contribution links |
| `companies.html` | Live company grid with backend search and error/empty states |
| `company-details.html` | Live profile, benefits, salary ranges, approved reviews/interviews, and report dialog |
| `login.html` | JWT session creation and safe local `returnTo` redirects |
| `register.html` | Job-seeker or current/former-employee registration |
| `submit-salary.html` | Authenticated pending salary contribution |
| `submit-review.html` | Employee-only pending company review |
| `interview-experience.html` | Authenticated pending interview experience |
| `employee-verification.html` | Current/former employee verification request |
| `admin.html` | Submission moderation, verification review, and report management |

## Authentication and Navigation

`js/auth.js` stores only the JWT and safe user object in `sessionStorage`; passwords are never stored. `js/api.js` attaches `Authorization: Bearer <token>` only to requests marked authenticated and clears stale state after authenticated `401` responses.

`js/nav.js` refreshes the current user through `/api/auth/me`, replaces stale stored role/profile display, renders the signed-in identity and sign-out action, and exposes the verification link only to employee accounts. Registration offers only `NORMAL` and `EMPLOYEE`; ADMIN access cannot be requested publicly.

## Contribution Forms

Salary, review, and interview pages load companies and/or job roles from the API, perform native plus JavaScript validation, and submit structured JSON. A successful write confirms that the contribution was submitted for moderation; it does not imply public approval.

Review submission requires an employee profile and includes five ratings, employment status, review date, pros/cons, optional advice, optional role, and anonymity. Interview submission includes role, date, difficulty, rounds, mode, result, duration, process, optional questions, and anonymity.

The employee-verification page checks the signed-in user and profile status. Current employees provide company-email metadata; former employees provide a proof type and safe reference. Its privacy notice makes clear that no document file or OTP is uploaded through this milestone.

## Company Detail and Public Safety

The company detail page loads company, benefit, salary, review, and interview data in parallel. Reviews show rating aggregates and approved cards; interviews show approved process cards. Pending, rejected, and flagged rows never appear.

The UI displays `Anonymous` whenever the API withholds `authorName`. It never tries to infer identity from session data or other fields. Content is rendered with DOM text nodes rather than untrusted HTML.

Signed-in users can report a displayed review or interview using a reason category and description. Signed-out users are redirected to login and returned locally. The exact success message is `Report submitted for review.`

## ADMIN Dashboard

`admin.html` verifies `/api/auth/me` before loading protected data. Signed-out users go to login; authenticated non-ADMIN users see access denied. Backend middleware remains the security boundary.

The dashboard contains:

- the pending contribution queue with salary/review/interview subtype detail;
- accessible approve/reject/flag confirmation and immutable history;
- pending employee-verification cards with private evidence metadata and verify/reject controls;
- reports with reporter/target context, reviewing/resolved/dismissed controls, and a link into the existing submission moderation panel.

Pending submissions allow all three decisions. Approved reported submissions allow flag/reject, and flagged submissions allow reject. Invalid transitions are also rejected by the backend.

## JavaScript Responsibilities

| Script | Responsibility |
| --- | --- |
| `js/api.js` | API base URL, token-aware JSON requests, safe errors |
| `js/auth.js` | Session storage and current-user lookup |
| `js/nav.js` | Responsive navigation, identity, sign-out, employee link |
| `js/companies.js` | Directory loading and search |
| `js/company-details.js` | Public company content and reporting |
| `js/login.js`, `js/register.js` | Account flows |
| `js/submit-salary.js` | Salary form options, validation, and POST |
| `js/review.js` | Review options, validation, and POST |
| `js/interview.js` | Interview options, validation, and POST |
| `js/verification.js` | Employee guard, conditional evidence, and POST |
| `js/admin.js` | ADMIN guard and all dashboard workflows |

## Design and Accessibility

The established styles remain in `css/common.css` and page-specific files. New controls reuse existing colors, spacing, typography, buttons, cards, status messages, and responsive behavior. Forms keep explicit labels, keyboard focus, live status/error regions, native constraints, and narrow-screen layouts. Confirmation/report interactions use native dialogs.

## Manual Test Checklist

With Oracle and the backend running:

1. Register a job seeker and an employee; confirm Current/Former is required only for the employee.
2. Sign in, refresh, and confirm `/api/auth/me` restores the session and navigation.
3. Submit a salary and confirm it remains absent from public aggregates until ADMIN approval.
4. As the employee, request verification and confirm duplicate active requests are rejected.
5. As ADMIN, inspect private evidence and verify or reject the request.
6. Submit a review and interview; confirm both remain absent from company detail until approved.
7. Approve them and confirm anonymous cards show no contributor identity.
8. Report an approved card; confirm duplicate reporting is rejected.
9. As ADMIN, mark the report reviewing, inspect the target, flag/reject when appropriate, then resolve the report.
10. Confirm flagged/rejected content disappears from company detail and review aggregates.
11. Recheck health, directory/search, company detail, benefits, and salary GET behavior.
12. Check keyboard use and a narrow viewport for overflow and readable dialog/form layouts.

## Frontend Structure

```text
frontend/
|-- css/                         # Shared and page-specific styles
|-- js/                          # API, auth, page, and workflow modules
|-- index.html
|-- companies.html
|-- company-details.html
|-- login.html
|-- register.html
|-- submit-salary.html
|-- submit-review.html
|-- interview-experience.html
|-- employee-verification.html
`-- admin.html
```

ML and deployment are intentionally outside the current milestone.
