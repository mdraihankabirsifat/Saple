# Saple Frontend

Saple's frontend is a responsive, framework-free application built with HTML, CSS, and Vanilla JavaScript ES modules. The current UI preserves the established visual system while separating public Browse pages from verified-employee Contribute actions and connecting profile, reporting, and ADMIN workflows to the Express API.

## Running Locally

Start the backend at `http://localhost:3000`, then run from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`. A static server is required for reliable ES-module loading. `js/api.js` contains the default API base URL.

## Connected Pages

| File | Behavior |
| --- | --- |
| `index.html` | Homepage, search handoff, trust explanation, and CSS-animated decorative sapling-to-tree illustration |
| `companies.html` | Live company grid with database-backed advanced filters and aggregate summaries |
| `salaries.html` | Public approved salary ranges with company, role, location, range, and source filters |
| `reviews.html` | Public approved reviews with company, role, location, and rating filters |
| `interviews.html` | Public approved interviews with company, role, location, difficulty, and mode filters |
| `faq.html` | Accessible accordion explaining public access, verification, moderation, privacy, and project limits |
| `about.html` | Academic purpose, workflow, technology, privacy model, disclaimer, and realistic future scope |
| `company-details.html` | Live profile, benefits, salary ranges, approved reviews/interviews, and report dialog |
| `login.html` | JWT session creation and safe local `returnTo` redirects |
| `forgot-password.html` | Registered-email reset-link request with loading and error states |
| `reset-password.html` | In-memory URL-token consumption and matching new-password form |
| `register.html` | Job-seeker or current/former-employee registration |
| `profile.html` | Safe account view, name editing, password change, and verified-company list |
| `submit-salary.html` | Company-verified employee pending salary contribution |
| `submit-review.html` | Company-verified employee pending company review |
| `interview-experience.html` | Company-verified employee pending interview experience |
| `employee-verification.html` | Current/former employee verification request |
| `admin.html` | Submission moderation, verification review, and report management |

## Authentication and Navigation

`js/auth.js` stores only the JWT and safe user object in `sessionStorage`; passwords are never stored. `js/api.js` attaches `Authorization: Bearer <token>` only to requests marked authenticated and clears stale state after authenticated `401` responses.

The login-page recovery link opens `forgot-password.html`. The reset page reads the emailed token once, removes it from the visible address bar with `history.replaceState`, keeps it only in memory, and never logs or stores it. Both forms prevent duplicate submissions, announce outcomes through live status regions, and use the backend's controlled error messages.

`js/nav.js` renders Home, Companies, Salaries, Reviews, Interviews, FAQ, and About consistently on every page, applies the active state and `aria-current`, and adds FAQ/About to every footer. It refreshes `/api/auth/me`, renders Profile/sign-out actions, exposes the verification link only to employee accounts, and shows `+ Contribute` plus page CTAs only when `verifiedCompanies` contains an active company verification. Registration offers only `NORMAL` and `EMPLOYEE`; ADMIN access cannot be requested publicly.

## Contribution Forms

`js/contribution-access.js` hides each contribution form until `/api/auth/me` confirms at least one active company-specific verification. Signed-out and unverified users receive an employee-verification-required state with the appropriate sign-in or verification action. The company selector contains only companies the current user is verified for. Backend middleware and repository checks remain the security boundary.

Salary, review, and interview pages load verified companies and job roles from the API, perform native plus JavaScript validation, and submit structured JSON. A successful write confirms that the contribution was submitted for moderation; it does not imply public approval.

Review submission requires an employee profile and includes five ratings, employment status, review date, pros/cons, optional advice, optional role, and anonymity. Interview submission includes role, date, difficulty, rounds, mode, result, duration, process, optional questions, and anonymity.

The employee-verification page checks the signed-in user and profile status. Current employees provide company-email metadata; former employees provide a proof type and safe reference. Its privacy notice makes clear that no document file or OTP is uploaded through this milestone.

The review and interview forms share integrated numbered section headers, consistent cards, padding, field grids, status placement, and narrow-screen rules. Submit Salary retains its established fieldset layout while using the same guarded contribution behavior.

## Profile and Security

`profile.html` displays only the safe `/api/auth/me` object and active verified companies. Users can normalize/change their full name and change their password by supplying the current password. Email is read-only because this milestone does not implement email-change verification. System roles, account/employment states, and verification values are display-only.

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
| `js/faq.js` | Single-open FAQ state and accordion keyboard navigation |
| `js/companies.js` | Directory loading and search |
| `js/browse-shared.js` | Shared public browse options, queries, metadata, and links |
| `js/salaries.js`, `js/reviews.js`, `js/interviews.js` | Approved-data browse filters and safe card rendering |
| `js/company-details.js` | Public company content and reporting |
| `js/login.js`, `js/register.js` | Account flows |
| `js/forgot-password.js`, `js/reset-password.js` | Temporary email password recovery |
| `js/profile.js` | Safe profile and password changes |
| `js/contribution-access.js` | Verified-company form guard and allowed-company list |
| `js/submit-salary.js` | Salary form options, validation, and POST |
| `js/review.js` | Review options, validation, and POST |
| `js/interview.js` | Interview options, validation, and POST |
| `js/verification.js` | Employee guard, conditional evidence, and POST |
| `js/admin.js` | ADMIN guard and all dashboard workflows |

## Design and Accessibility

The established styles remain in `css/common.css` and page-specific files. New controls reuse existing colors, spacing, typography, buttons, cards, status messages, and responsive behavior. Forms keep explicit labels, keyboard focus, live status/error regions, native constraints, and narrow-screen layouts. Confirmation/report interactions use native dialogs. The FAQ uses native buttons with linked regions, visible expanded state, single-open behavior, Escape collapse, and Arrow/Home/End focus movement.

The homepage tree is decorative inline SVG with CSS path drawing and staggered leaf groups. It plays once in about 3.3 seconds, requires no JavaScript or external asset, keeps the mature tree as its base/final state, stacks below the hero text on small screens, and disables every animation under `prefers-reduced-motion: reduce`.

## Manual Test Checklist

With Oracle and the backend running:

1. Register a job seeker and an employee; confirm Current/Former is required only for the employee.
2. Sign in, refresh, and confirm `/api/auth/me` restores the session and navigation.
3. As a public visitor, browse and filter Companies, Salaries, Reviews, and Interviews without signing in.
4. As a normal account, confirm all three contribution pages show the verification-required state and direct POSTs return `403`.
5. As the employee, request verification and confirm duplicate active requests are rejected.
6. As ADMIN, inspect private evidence and verify or reject the request.
7. Refresh the employee session; confirm `+ Contribute` appears and each form lists only verified companies.
8. Submit salary, review, and interview records; confirm all remain absent from public pages until approved.
9. Approve them and confirm anonymous cards show no contributor identity.
10. Open Profile, change the name, confirm email/system fields are read-only, and test current-password validation.
11. Report an approved card; confirm duplicate reporting is rejected.
12. As ADMIN, mark the report reviewing, inspect the target, flag/reject when appropriate, then resolve the report.
13. Confirm flagged/rejected content disappears from public pages and review aggregates.
14. Check keyboard use and desktop, tablet, and mobile widths for navigation/form/filter overflow.
15. Open FAQ and About from the header and footer on desktop/mobile; confirm their active states and use the FAQ with pointer, Enter/Space, Escape, Arrow keys, Home, and End.
16. Configure SMTP, request a reset email, use the received link once, and confirm invalid, expired, reused, mismatched, and weak-password cases show controlled messages.
17. View the homepage at desktop/tablet/mobile sizes, then enable reduced motion and disable JavaScript; confirm the mature decorative tree remains visible without overflow.

## Frontend Structure

```text
frontend/
|-- css/                         # Shared and page-specific styles
|-- js/                          # API, auth, page, and workflow modules
|-- index.html
|-- companies.html
|-- salaries.html
|-- reviews.html
|-- interviews.html
|-- faq.html
|-- about.html
|-- company-details.html
|-- login.html
|-- register.html
|-- forgot-password.html
|-- reset-password.html
|-- profile.html
|-- submit-salary.html
|-- submit-review.html
|-- interview-experience.html
|-- employee-verification.html
`-- admin.html
```

ML and deployment are intentionally outside the current milestone.
