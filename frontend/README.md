# Saple Frontend

The Saple frontend is a responsive, framework-free application built with HTML, CSS, and Vanilla JavaScript ES modules. It presents live company data, supports real registration and login, and sends authenticated salary contributions to the Express API while preserving the existing visual design.

## Connected Features

- Company directory and backend search through `GET /api/companies`
- Company profiles, benefits, and salary summaries through the existing GET endpoints
- Registration through `POST /api/auth/register`
- Login through `POST /api/auth/login`
- Current-user recovery through `GET /api/auth/me`
- Company and job-role choices through `GET /api/companies` and `GET /api/job-roles`
- Authenticated salary contribution through `POST /api/companies/:companyId/salaries`
- ADMIN-only moderation queue, detail, decisions, and history through `/api/admin/submissions/*`
- Shared signed-in navigation and sign-out behavior

Review and interview forms remain honest placeholders. Forgot-password, employee-verification, reporting, ML, and deployment are not implemented.

## Running the Frontend

Start the backend at `http://localhost:3000`, then run this from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`. A static server is required for reliable ES-module loading.

The API base URL is defined in `js/api.js`:

```js
const API_BASE_URL = 'http://localhost:3000';
```

## Pages

| File | Behavior |
| --- | --- |
| `index.html` | Homepage with search handoff, trust explanation, salary methodology, and contribution CTA |
| `companies.html` | Live company grid, backend search, and loading/empty/error states |
| `company-details.html` | Live profile, salary panels, benefits, and review/interview placeholders |
| `login.html` | Validates credentials, creates a session, and supports a safe local `returnTo` redirect |
| `register.html` | Creates job-seeker or employee accounts; employee status is conditionally required |
| `submit-salary.html` | Loads controlled company/role choices and submits salary data for review |
| `admin.html` | Guards ADMIN access and provides the functional moderation dashboard |
| `submit-review.html` | Placeholder until review submission is implemented |
| `interview-experience.html` | Placeholder until interview submission is implemented |

## Authentication and Session Behavior

`js/auth.js` stores the JWT and safe user object in `sessionStorage`. It never stores a password. `js/api.js` adds `Authorization: Bearer <token>` only when an authenticated request is requested and clears stale session state after an authenticated `401` response.

On page load, `js/nav.js` uses the stored session and refreshes it through `/api/auth/me`. Signed-in users see their first name and a Sign out action; signed-out users see Sign in and Create account. Login supports the salary page's local `returnTo` link without allowing an external redirect.

Registration exposes only Job seeker (`NORMAL`) and Employee (`EMPLOYEE`) account types. Employee registration additionally sends `CURRENT` or `FORMER`; it does not claim that employment is verified.

## Salary Submission

The salary form loads both companies and job roles from the API. A submission requires a current token and sends:

| Field | Contract |
| --- | --- |
| `roleId` | Positive job-role ID selected from the API |
| `baseSalary` | Positive amount with at most two decimal places |
| `additionalCompensation` | Optional non-negative amount |
| `currency` | Three-letter uppercase code; `BDT` by default |
| `payPeriod` | `MONTHLY` or `YEARLY` |
| `yearsOfExperience` | `0` to `60`, at most one decimal place |
| `employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, or `INTERN` |
| `workMode` | `ONSITE`, `HYBRID`, or `REMOTE` |
| `salaryYear` | Integer from `2000` through `2100` |
| `isAnonymous` | Boolean checkbox value |

A successful request displays exactly `Salary submitted for review.` An unauthenticated or expired session displays a link to sign in and return to the salary form. New submissions are pending and do not immediately change public salary summaries.

## JavaScript Responsibilities

| Script | Responsibility |
| --- | --- |
| `js/api.js` | API base URL, token-aware requests, JSON parsing, and safe error normalization |
| `js/auth.js` | Session token/user storage and current-user lookup |
| `js/nav.js` | Mobile navigation, contribution menu, signed-in identity, and sign-out |
| `js/companies.js` | Backend-powered directory loading/search and card rendering |
| `js/company-details.js` | Company ID validation and profile/benefit/salary rendering |
| `js/login.js` | Login validation, API request, session creation, and redirect |
| `js/register.js` | Registration validation and API request |
| `js/submit-salary.js` | Company/role loading, validation, authentication, and salary POST |
| `js/admin.js` | ADMIN guard, pending queue, detail/history rendering, confirmation, and PATCH decisions |

## Admin Moderation Dashboard

`admin.html` calls `/api/auth/me` before loading moderation data. Signed-out users return to login with a local `returnTo`; authenticated non-admin users see an access-denied state. Backend authorization remains the security boundary.

The queue is oldest first and displays real pending submissions. Review shows common context and salary, review, or interview subtype fields already present in Oracle. Approve, Reject, and Flag use an accessible confirmation dialog; Reject and Flag require a note. After a decision, the queue and chronological moderation history refresh without inventing counts or content.

## Design and Accessibility

The existing design system remains in `css/common.css` plus page-specific styles. `css/admin.css` composes those established tokens and components for the moderation layout without redesigning the application.

The UI retains semantic landmarks, labels, keyboard focus, live validation/status messages, ARIA navigation state, safe external links, reduced-motion handling, and responsive single-column layouts. Browser testing covered the full registration-login-salary flow and a 430px viewport without horizontal overflow or runtime JavaScript errors.

## Error and Empty States

Connected pages handle loading, empty results, API failure, invalid IDs, missing records, absent salary data, form validation, duplicate registration, invalid login, expired sessions, access denial, conflicting moderation decisions, and failed write requests. Raw database errors are never intentionally displayed.

## Manual Test Checklist

With Oracle and the backend running:

1. Register a Job seeker and confirm the login-page success message.
2. Register an Employee and verify that Current/Former status is required.
3. Sign in and confirm the navigation shows the user's first name.
4. Refresh a page and confirm `/api/auth/me` preserves the session.
5. Open the salary form and confirm company and job-role choices load.
6. Submit valid salary data and confirm `Salary submitted for review.` appears.
7. Sign out and confirm salary submission requests sign-in instead.
8. Recheck company directory, search, profile, benefits, and both salary summaries.
9. Stop the backend and confirm errors remain user-friendly.
10. Check keyboard controls and narrow-screen layouts.
11. Sign in with a locally prepared ADMIN account and review the pending queue.
12. Approve, reject, and flag test submissions; confirm the selected item leaves the queue and its audit history appears.

## Frontend Structure

```text
frontend/
|-- css/                    # Shared and page-specific styles
|-- js/                     # API, auth, navigation, and page modules
|-- companies.html          # Live company directory
|-- company-details.html    # Live company profile
|-- index.html              # Homepage
|-- login.html              # Connected sign in
|-- register.html           # Connected registration
|-- submit-salary.html      # Connected salary contribution
|-- admin.html              # ADMIN moderation dashboard
|-- submit-review.html      # Review placeholder
`-- interview-experience.html
```
