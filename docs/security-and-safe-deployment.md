# Security remediation and safe redeployment

**Written for:** the Saple owner, before creating a new Render service and
before asking Google to review the site.

> **Nothing in this repository guarantees that Google will clear the site, or
> that Render will accept a new service.** The code changes below remove the
> things most likely to look unsafe and make the site honest about what it is.
> Verifying the domain, reading Google's actual findings, and requesting a
> review are steps only you can take, with your own accounts.

---

## 1. What happened, and why the old service must stay gone

Google Web Risk flagged the previous Render service. Render suspended the
account, restored it, kept the flagged service suspended and asked for it to be
deleted, for significant changes to be made, and for a new service to be
created.

Do **not**:

- restore, redeploy or clone the deleted service;
- reuse its exact service name, which would try to claim the same flagged
  `onrender.com` subdomain;
- point a custom domain at the new service that was previously pointed at the
  flagged one, until that domain's Search Console report is clean;
- deploy the old commit or any commit from before this remediation.

A flag attaches to URLs and hosts, not to your intentions. A second flagged
deployment on the same account may be treated far more severely than the first.
`render.yaml` now names the service `saple-academic` so a Blueprint deploy
creates a fresh subdomain; change the name if you prefer, but not back to the
old one.

We do not know which specific page or behaviour triggered the original flag.
Google's Security Issues report for the old URL is the only source that could
say, and it was not available while preparing this code. Section 3 lists what
was found and fixed; none of it is claimed to be *the* cause.

---

## 2. What Google looks for

Google's social-engineering guidance
(<https://developers.google.com/search/docs/monitor-debug/security/social-engineering>)
describes deceptive sites as ones that trick visitors into doing something
dangerous: revealing passwords or personal information, installing software,
or trusting a page that pretends to be someone else. A site with a sign-in page,
company names and logos, and job applications can look like that pattern even
when it is innocent, especially if it loads content from hosts it does not
control.

Saple's remediation therefore focuses on three things: never pretend to be
anyone else, never load anything from a host Saple does not control, and make
the site's identity unmissable on every page that asks for input.

---

## 3. What was changed in the code

### 3.1 Identity and honesty

- Every page's footer carries "Saple - an independent BUET CSE academic
  project for company and career insights" and a statement that Saple is not
  affiliated with, endorsed by, or an official login or careers service for any
  listed company. The header wordmark carries a short tagline to the same
  effect.
- Sign-in, registration, forgot-password, reset-password, employee
  verification, job application and the representative workspace each show a
  notice beside the form saying whose account this is, and that Saple never
  asks for a company, Google or Microsoft password.
- There is no "Sign in with Google" or any other third-party sign-in control,
  and no third-party brand is imitated anywhere.
- Privacy, Terms, Security and Contact pages describe what is actually
  implemented, including its limits.
- The password-reset email names Saple as an academic project, shows which site
  the link points to, and says Saple never asks for passwords by email.

### 3.2 No third-party code or content

- **Removed:** the company-logo helper built image URLs at `logos.hunter.io`
  and `icons.duckduckgo.com` from each company's `website` column, so database
  content decided which external host a visitor's browser contacted. Company
  marks are now generated locally from the company name.
- No page loads any remote script, stylesheet, font, image, iframe or tracker.
  An automated test walks every frontend file to keep it that way.

### 3.3 HTTP and browser hardening

Every response, including static pages and errors, carries:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `base-uri 'self'`, plus `upgrade-insecure-requests` over HTTPS |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone, geolocation, payment and similar all denied |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | 180 days, **only** when the request arrived over HTTPS |
| `Cache-Control` on `/api/*` | `no-store` |

`X-Powered-By` is removed. There is no `unsafe-inline` and no `unsafe-eval`:
no page has an inline script, inline style or `on*=` handler.

Other controls:

- JSON and form bodies are capped at 64 KB; oversized or malformed bodies get
  the normal JSON error envelope, never a stack trace.
- No endpoint redirects to a destination taken from the request. Sign-in's
  `returnTo` accepts only a bare same-site page name.
- The AI guide calls one fixed provider URL from server configuration; it is
  not a relay.
- All dynamic content is rendered with `textContent`. There is no `innerHTML`,
  `eval`, `new Function`, `document.write` or `insertAdjacentHTML` anywhere.
- Directory listing is off and dotfiles are never served.
- The service worker caches first-party static files only, never an API
  response, never a private page, and never a request with an `Authorization`
  header. Its cache is versioned and old versions are deleted.

### 3.4 Abuse controls

| Endpoint | Limit |
|----------|-------|
| Sign-in | 20 per 15 minutes per address + email |
| Registration | 10 per hour per address |
| Forgot password | 5 per 15 minutes per address + email |
| Reset password | 10 per 15 minutes per address |
| Reports | 20 per hour per account |
| Verification requests | 10 per day per account |
| Job applications | 10 per hour per account |
| Representative requests | 5 per day per account |
| Saple Guide | 15 per 10 minutes per address |

Every limit answers `429` with the JSON envelope and a `Retry-After` header.
**These limiters live in process memory.** They reset on restart and are not
shared across instances — adequate for one free-tier instance, not for a
scaled deployment.

Password recovery no longer reveals whether an address is registered.

### 3.5 Dependencies

Nodemailer was upgraded from 9.0.5 to 9.1.1 to clear four published advisories.
`npm audit --omit=dev` reports 0 vulnerabilities.

### 3.6 Crawling and security contact

- `/robots.txt` allows public pages and disallows `/api/`, the admin and
  representative workspaces, profile, applications and every account form.
- `/sitemap.xml` lists public pages only, using the requesting origin, so it is
  correct on any domain without editing.
- `/.well-known/security.txt` publishes a contact only if you set
  `SECURITY_CONTACT` to a `mailto:` or `https:` value. Until then it says no
  contact is configured, rather than inventing an address.

---

## 4. Before you deploy: check it yourself

From the repository root:

```
cd backend
npm ci
npm test                      # every test must pass
npm audit --omit=dev          # expect 0 vulnerabilities
cd ..
git diff --check              # expect no output
```

Then look for anything that should not be there:

```
git grep -nE "https?://" -- frontend/        # only github.com links and code comments
git grep -nE "innerHTML|eval\(|new Function" -- frontend/ backend/
git status                                    # confirm backend/.env is not staged
```

Start the site locally and inspect it the way Google will:

1. Open `http://localhost:3000` in a desktop browser with DevTools open.
2. **Network tab:** reload each public page. Every request must go to
   `localhost:3000`. Any other host is a finding.
3. **Console tab:** there should be no CSP violation messages.
4. **View source** on the homepage, sign-in and job-details pages: confirm the
   identity statement and disclaimer are present.
5. Repeat in the browser's mobile emulation mode.

---

## 5. Create the new Render service

1. Make sure the remediated commit is on the branch you will deploy, and that
   `git status` shows no uncommitted change you intended to include.
2. In Render, choose **New → Blueprint**, select this repository, and review
   the single `saple-academic` web service. It creates no database and no disk.
3. Render will prompt for every `sync: false` variable. Enter them privately
   (section 6). Let Render generate `JWT_SECRET`.
4. Apply, and watch the build and start logs. The service refuses to start
   without `DATABASE_URL`; that is intentional.
5. Note the new `https://<name>.onrender.com` URL. Set `FRONTEND_URL` to it
   (and later to your custom domain, if you add one).

If you prefer not to use a Blueprint, create a **Web Service** manually with
build command `npm ci --omit=dev --prefix backend`, start command
`npm start --prefix backend` and health check path `/api/health`, then add the
same variables.

## 6. Secrets you enter privately

Never commit these, paste them into chat, screenshot them, or put them in
frontend code.

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Supabase **Session pooler** connection string, password filled in |
| `JWT_SECRET` | Let Render generate it |
| `FRONTEND_URL` | The new service's public HTTPS origin |
| `CORS_ORIGINS` | Leave empty for same-origin hosting |
| `SECURITY_CONTACT` | Optional `mailto:` or `https:` contact for security.txt |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | See `docs/email-setup-and-test.md` |
| `AI_ENABLED`, `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | Optional. See `docs/ai-assistant-setup.md` |

Apply the database migrations (`database/postgres/migrations/README.md`) to a
backup project first, then to the live project, **before** the new code
serves traffic. The new code expects the 21-table schema.

## 7. Post-deployment smoke test

On the new URL, in order:

| Check | Expect |
|-------|--------|
| `/` | The homepage, with the academic-project badge and disclaimer |
| `/api` | `{"success":true,"message":"Welcome to the Saple API"}` |
| `/api/health` | `200`, JSON |
| `/api/health/database` | `200`, JSON; a `500` means `DATABASE_URL` or the pooler is wrong |
| `/api/companies` and `/jobs.html` | Real data, or an honest empty state |
| `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` | Present, using the new origin |
| Response headers on `/` | CSP, `X-Frame-Options: DENY`, and HSTS (HTTPS only) |
| Register, sign in, open profile, sign out | Works; the old token is rejected afterwards |
| Forgot password with a test account | Email arrives (check spam); link works once |
| Representative and admin flows | See the manual test sequence in `README.md` |

Then open DevTools on the live site and repeat the Network and Console checks
from section 4.

---

## 8. Google Search Console

### 8.1 Verify the new site

1. Open <https://search.google.com/search-console> with the Google account you
   want to own the property.
2. **Add property → URL prefix**, and enter the exact new origin, for example
   `https://saple-academic.onrender.com/`. (A *Domain* property needs DNS
   control, which you do not have on `onrender.com`; use it only for a custom
   domain you own.)
3. Choose the **HTML tag** method. Google shows a
   `<meta name="google-site-verification" content="...">` tag.
4. Add that single line inside `<head>` in `frontend/index.html`, commit, and
   let the new service redeploy. A `meta` tag is not affected by the CSP.
5. Click **Verify**.

Alternatively choose **HTML file**, save the file Google gives you into
`frontend/`, and deploy. Either way, the verification token identifies your
Google account, not a secret; it is fine to commit.

### 8.2 Read the Security Issues report

**Security & Manual Actions → Security issues.** For a new property this
should say no issues were detected. If it lists any:

- note the **issue type** (for example "Deceptive pages") and every **sample
  URL**;
- open each sample URL yourself and find what on that page matches the
  description;
- fix it in code, redeploy, and re-check the page.

Sample URLs are examples, not a complete list. Assume the same pattern exists
elsewhere and check similar pages.

Also check the current Safe Browsing status of the new URL at
<https://transparencyreport.google.com/safe-browsing/search>.

### 8.3 Inspect how Google renders the pages

For each public page (home, companies, jobs, a job detail, sign-in):

1. Paste the URL into the **URL Inspection** bar at the top.
2. Click **Test live URL**, then **View tested page**.
3. Check the **Screenshot** shows the real page, not an error.
4. Check **HTML** contains the identity statement and disclaimer.
5. Under **More info**, check **Page resources** lists only your own origin,
   and **JavaScript console messages** shows no errors.

The live test renders as Google's smartphone crawler. For the desktop view,
compare against the desktop browser check in section 4; the markup and
resources are identical, only the layout differs.

### 8.4 Request a review — only when everything is fixed

Only if Security Issues lists a problem, and only after every listed problem
and every similar page is fixed and deployed:

1. In **Security issues**, select **I have fixed these issues**, then
   **Request review**.
2. Describe exactly what you changed, factually. For example:

   > Removed a client-side script that loaded company logo images from
   > third-party hosts derived from database content; logos are now generated
   > locally. Added an explicit site-identity statement and non-affiliation
   > disclaimer to every page and beside every sign-in and application form.
   > Added a restrictive Content-Security-Policy that blocks all third-party
   > scripts, frames and images. The site is an independent academic project
   > and does not collect credentials for any third party.

3. Do not claim anything you have not done, and do not describe the change as
   a way of passing review. Write what is true.
4. Wait. Reviews for security issues take time, from days to weeks. Do not
   submit repeated requests while one is pending.

If the review is rejected, the reply usually names what is still wrong. Fix
that, verify it with URL Inspection, and only then request again.

---

## 9. After it is live

- Keep `npm audit --omit=dev` at zero; re-run it before every deployment.
- Re-check Search Console's Security Issues report after significant changes.
- Never add a third-party script, widget, analytics tag, font CDN or image host
  without updating the CSP deliberately and understanding why.
- If you ever see a Render or Google notice, stop deploying and read it before
  changing anything.
