# Saple Frontend

The Saple frontend is a responsive, framework-free application built with HTML, CSS, and Vanilla JavaScript. It presents live company information from the Express API and provides the UI foundation for future authentication and contribution workflows.

## Current Status

### Connected to the backend

- Company directory through `GET /api/companies`
- Backend-powered company search through `GET /api/companies?search=term`
- Company profiles through `GET /api/companies/:companyId`
- Company benefits through `GET /api/companies/:companyId/benefits`
- Verified and Community Salary Range summaries through `GET /api/companies/:companyId/salary-summary`
- Company choices on the salary form through `GET /api/companies`

### UI-only foundations

- Sign-in form
- Job-seeker and employee registration form
- Salary contribution form
- Password visibility controls
- Client-side validation and accessible error messages
- Review and interview workflow placeholders

The UI-only forms do not send fake requests, store passwords, create tokens, use localStorage as a substitute backend, or report false success.

## Running the Frontend

Start the backend first so live company data is available at `http://localhost:3000`.

From the repository root, serve this directory over HTTP:

```bash
python -m http.server 5500 --directory frontend
```

Then open:

```text
http://localhost:5500/index.html
```

A static server is recommended because `companies.js`, `company-details.js`, and `submit-salary.js` use ES modules. Opening pages directly with a `file://` URL may prevent module loading in some browsers.

The API base URL currently lives in `js/api.js`:

```js
const API_BASE_URL = 'http://localhost:3000';
```

## Pages

| File | Behavior |
| --- | --- |
| `index.html` | Homepage with hero, company-search handoff, trust explanation, salary methodology, and contribution CTA |
| `companies.html` | Live company grid, backend search, clear action, and loading/empty/error states |
| `company-details.html` | Live company profile, salary panels, benefits, and review/interview placeholders |
| `login.html` | Local email/password validation and show/hide password control |
| `register.html` | Local account validation, job-seeker/employee types, and conditional employment status |
| `submit-salary.html` | Structured salary form with live company options and backend-compatible controlled values |
| `submit-review.html` | Honest placeholder until the review workflow is enabled |
| `interview-experience.html` | Honest placeholder until interview submissions are enabled |

## Application Shell

Public pages share:

- Saple branding
- Companies, Salaries, Reviews, and Interviews navigation
- Sign-in and Create account actions
- A contribution dropdown for salary, review, and interview workflows
- A compact mobile menu below 900px
- A consistent project footer

`js/nav.js` owns mobile-navigation and contribution-menu behavior. Page-specific scripts do not duplicate it.

## Design System

`css/common.css` defines the shared tokens and components, including:

- Saple green palette and semantic color aliases
- Containers and page/section spacing
- Buttons, badges, cards, inputs, field groups, and state messages
- Navigation and footer layouts
- Focus-visible and reduced-motion behavior
- Shared responsive breakpoints

Page-specific styles remain separated:

| Stylesheet | Responsibility |
| --- | --- |
| `css/home.css` | Homepage hero, search, trust, salary explanation, and CTA |
| `css/companies.css` | Directory header, search layout, and company grid/cards |
| `css/company-details.css` | Company profile, section navigation, benefits, salaries, and placeholders |
| `css/forms.css` | Shared form grids, sections, choices, errors, actions, and trust notices |
| `css/auth.css` | Login and registration layouts |
| `css/salary-form.css` | Salary contribution layout and guidance sidebar |

## JavaScript Responsibilities

| Script | Responsibility |
| --- | --- |
| `js/api.js` | Shared API base URL, JSON parsing, and safe error normalization |
| `js/nav.js` | Mobile menu and contribution dropdown |
| `js/companies.js` | Backend-powered directory loading/search and company-card rendering |
| `js/company-details.js` | ID validation plus company, benefit, and salary rendering |
| `js/login.js` | Login validation and password visibility |
| `js/register.js` | Registration validation, password visibility, and employee fields |
| `js/submit-salary.js` | Live company loading and salary-form validation |

## Salary Form Contract Preparation

The salary form uses these backend-compatible controlled values:

| Field | Values |
| --- | --- |
| Currency | Three-letter uppercase code, with `BDT` as the default |
| Pay period | `MONTHLY`, `YEARLY` |
| Employment type | `FULL_TIME`, `PART_TIME`, `INTERN`, `CONTRACT` |
| Work mode | `ONSITE`, `HYBRID`, `REMOTE` |
| Anonymous display | Boolean checkbox prepared for `isAnonymous` |

The company field uses the live companies endpoint. Job role remains a validated text field because no job-role lookup endpoint currently exists. The form displays this clearly and does not invent a route.

After valid local input, the form displays:

> Salary submission backend will be connected in the next implementation step.

No submission is stored or transmitted.

## Authentication Form Behavior

The login and registration pages perform local validation only. Valid forms display clear backend-status messages:

- `Authentication backend is not connected yet.`
- `Registration backend is not connected yet.`

Registration exposes only Job seeker and Employee account types. It does not expose administrator registration. Selecting Employee reveals Current employee and Former employee choices, but this does not claim employment verification.

## Error and Empty States

The connected pages handle:

- Initial loading
- Empty company directory
- No backend search matches
- Backend connection failure
- Invalid API response
- Invalid company ID
- Missing company
- No recorded benefits
- No verified salary data
- No community salary data

Raw database errors are never intentionally shown by the frontend.

## Accessibility and Responsiveness

The frontend includes:

- Semantic landmarks and heading hierarchy
- Explicit form labels and required indicators
- Accessible status and validation messages
- Button elements for interactive controls
- Visible keyboard focus
- ARIA state on the mobile navigation
- Safe external company links
- `prefers-reduced-motion` handling
- Single-column cards and forms on narrow screens

The layouts were browser-checked at approximately 1440px, 1024px, 768px, and 430px with no horizontal overflow.

## Manual Test Checklist

With Oracle and the backend running:

1. Open `index.html` and use the company search.
2. Confirm `companies.html` loads Oracle-backed company records.
3. Search for a company and clear the search.
4. Open a company card and confirm its profile loads.
5. Confirm benefits, verified salaries, and community salaries render.
6. Open `company-details.html?id=invalid` and confirm the invalid-ID state.
7. Stop the backend and confirm company API errors remain user-friendly.
8. Validate the login form and password toggle.
9. Validate registration, password matching, and Employee field reveal.
10. Validate every salary form section and confirm no fake submission occurs.
11. Test navigation and forms using keyboard controls.
12. Check layouts near 1440px, 1024px, 768px, and 430px.

## Endpoints Needed Next

The next backend milestone should provide compatible contracts for:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- A job-role lookup endpoint, such as `GET /api/job-roles`
- `POST /api/companies/:companyId/salaries`

Review and interview APIs are also required before their public contribution workflows can be enabled.

## Frontend Structure

```text
frontend/
|-- css/                    # Shared and page-specific styles
|-- js/                     # Shared API/navigation and page scripts
|-- companies.html          # Live company directory
|-- company-details.html    # Live company profile
|-- index.html              # Homepage
|-- login.html              # UI-only sign in
|-- register.html           # UI-only registration
|-- submit-salary.html      # Prepared salary contribution form
|-- submit-review.html      # Review workflow placeholder
`-- interview-experience.html
```
