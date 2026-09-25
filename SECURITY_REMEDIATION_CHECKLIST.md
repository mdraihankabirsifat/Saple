# Security remediation checklist

**Written for:** the Saple owner, working through the Safe Browsing warning and
the exposed SMTP credential.

Chrome showed a "Dangerous site" interstitial on `/profile.html` of
`saple-academic-ww3x.onrender.com`, and the service is suspended. Google does
not publish the reason, so this page separates what the code now does
(Section A, all verifiable here) from what only you can do (Section B).

**The cause is not proven.** What is true is that the page Google flagged asked
a signed-in visitor to type their current password, on a brand-new domain with
no reputation. That is the shape of a credential-harvesting page, whether or
not it is what a classifier objected to. It has been removed rather than
argued with.

---

## A. Completed in the code

Each item names the file that implements it and the test that holds it in
place. Run the suite from `backend/` with `npm test`.

### A1. No signed-in password entry anywhere

| What | Where |
|---|---|
| The "Change password" card and both password fields are gone | `frontend/profile.html` |
| The browser logic that posted them is gone | `frontend/js/profile.js` |
| `PATCH /api/auth/me/password` no longer exists | `backend/routes/auth.routes.js` |
| `changePassword` removed from controller and service | `backend/controllers/auth.controller.js`, `backend/services/auth.service.js` |
| `updatePasswordHash` / `findPasswordHashById` removed | `backend/repositories/user.repository.js` |
| The profile now offers an emailed single-use reset instead | `frontend/profile.html` → `forgot-password.html` |

A password is now entered on exactly three pages: sign-in, registration, and
the reset page reached through a single-use emailed link. The reset flow still
writes the new hash and raises `token_version` in one transaction, so every
other session is signed out.

**Tests:** `tests/indexing-and-identity.test.js` ("password inputs exist only
on the three Saple credential pages", "the profile page offers an emailed reset
instead of a password form"), `tests/auth.service.test.js` ("there is no
signed-in password change anywhere in the backend").

### A2. Private pages are not indexable

| What | Where |
|---|---|
| One classification used by robots.txt, the sitemap, the header and the tests | `backend/config/pages.js` |
| `<meta name="robots" content="noindex, nofollow">` on all 12 private pages | every account, contribution and workspace page |
| `X-Robots-Tag: noindex, nofollow` on private paths and all of `/api/` | `backend/middleware/securityHeaders.js` |
| robots.txt disallows the same paths; the sitemap lists only public pages | `backend/controllers/site.controller.js` |
| Public directory pages stay indexable | homepage, companies, company details, salaries, reviews, interviews, jobs, job details, FAQ, About, Privacy, Terms, Security, Contact |

**Tests:** `tests/indexing-and-identity.test.js` — every HTML file must be
classified exactly once, and a new page that is neither public nor private
fails the suite.

### A3. Nothing deceptive on any form

- Saple asks only for a Saple email address and a Saple password.
- No page asks for a Google, Microsoft, Gmail, corporate, Supabase, Render or
  AI-provider password; a test scans every page for that wording.
- Employee verification accepts a company email address or a proof reference,
  never a mailbox password.
- The academic identity and non-affiliation notice sits inside the form card on
  sign-in, registration, forgot-password and reset-password, not only in the
  footer.
- No third-party logo, brand or BUET branding is used as if Saple were an
  official service.

**Tests:** `tests/indexing-and-identity.test.js`, `tests/frontend.layout-pass.test.js`.

### A4. Browser and server hardening (unchanged, still verified)

Strict first-party CSP with no `unsafe-inline` or `unsafe-eval`; no remote
script, style, font, image, iframe or tracker; same-origin API with an
allowlisted `returnTo`; no `innerHTML`, `eval` or `document.write`; no API or
private response in the service-worker cache; bounded bodies; per-endpoint rate
limits; HSTS over HTTPS; `X-Frame-Options: DENY`; `nosniff`; referrer and
permissions policies; and no credential, raw reset token, provider response
body or `DATABASE_URL` in any log.

**Tests:** `tests/hosting.test.js`, `tests/offline-cache.test.js`,
`tests/frontend.protected-pages.test.js`, `tests/ai-guide-online.test.js`.

### A5. Repository secret scan

The full tracked tree (293 files) and the complete history (62 commits) were
scanned for provider keys, database URLs with credentials, private keys, JWTs
and SMTP values.

- **No live credential was found**, in the working tree or in any commit.
- No `.env` file has ever been committed.
- Every match is a documentation placeholder or a labelled test fixture.
- Therefore **no history rewrite is required.** If a real secret is ever found
  later, the plan is: rotate first, then rewrite with `git filter-repo`, force-push
  once, and have every clone re-cloned — and that needs your explicit go-ahead.

**This does not make rotation optional.** You reported an SMTP App Password
exposed outside the repository; a credential that has been exposed anywhere is
compromised. See B1.

---

## B. Only you can do these

Code cannot rotate a provider credential, read your Search Console, or talk to
Render support.

### B1. Revoke the exposed SMTP App Password — do this first

1. Open <https://myaccount.google.com/apppasswords> for the sending account.
2. **Delete** the App Password Saple was using. Deleting it is the revocation;
   changing `SMTP_PASS` alone leaves the old one valid.
3. Create a new App Password, named for this service only.
4. Put it **only** in Render → Environment → `SMTP_PASS`. Never in GitHub, a
   screenshot, a commit, a test fixture or a support ticket.
5. While you are there, confirm 2-Step Verification is on and review recent
   security activity on that Google account.

### B2. Rotate anything else that may have been exposed

- `JWT_SECRET`: let Render generate a new one. Every existing session is signed
  out, which is the intended effect.
- `DATABASE_URL`: if the connection string was ever pasted anywhere, reset the
  database password in Supabase and update the variable.
- `AI_API_KEY`: create a fresh Groq key; delete the old one in the console.

### B3. Review GitGuardian

Mark the earlier Saple incidents as **False positive** or **Test credential**
(see the note in the previous remediation pass). Do not paste any secret value
into the comment field.

### B4. Find out what Google actually flagged

1. Open [Search Console](https://search.google.com/search-console) for the
   property.
2. **Security Issues** — read the exact URL and category it reports. This is
   the only authoritative statement of the cause.
3. **URL Inspection** on `/profile.html` — see the page as Google fetched it.
4. Keep that evidence. If the report names something this pass did not address,
   fix that before requesting a review.

### B5. Talk to Render before resuming

The account has already had one suspension, so do not simply spin up another
subdomain — repeatedly moving looks like evasion.

1. Open a Render support ticket from the dashboard.
2. Say plainly: an academic project was flagged by Safe Browsing; the
   credential-collecting page has been removed; the exposed SMTP credential is
   rotated; you would like to resume the existing service.
3. Resume **the same suspended service** once they agree, deploying the
   remediated commit.

### B6. Set the Render environment before the first request

Names only; values go in the dashboard.

`DATABASE_URL` (Supabase Session Pooler, percent-encoded), `DB_SSL=true`,
`JWT_SECRET` (generated), `FRONTEND_URL` (the exact HTTPS origin),
`CORS_ORIGINS` (empty for same-origin), `SECURITY_CONTACT`,
`SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS` (the new App
Password)/`SMTP_FROM`, and the `AI_*` group from
[`docs/ai-assistant-setup.md`](docs/ai-assistant-setup.md).

### B7. Smoke-test the live service

```bash
curl -s https://<service>.onrender.com/api/health
curl -s https://<service>.onrender.com/api/health/database
curl -sI https://<service>.onrender.com/profile.html | grep -i x-robots-tag   # noindex, nofollow
curl -sI https://<service>.onrender.com/companies.html | grep -i x-robots-tag  # nothing
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH https://<service>.onrender.com/api/auth/me/password  # 404
```

Then, in a browser: sign in, confirm the profile page has no password field,
request a reset email and use the link once, and ask the Saple Guide a question
(the panel should show the green **Online** pill).

### B8. Request the Google review — last, not first

Only after B1–B7 pass: Search Console → Security Issues → **Request review**,
describing what changed in plain terms (password entry removed from the
signed-in area, private pages no longer indexable, exposed mail credential
rotated). Do not request a review while anything above is outstanding; a failed
review is slower to recover from than a delayed one.

---

## What is still unproven

- The exact reason for the Safe Browsing flag. Section B4 is how you find out.
- Whether the new SMTP credential delivers mail: that needs a real send, from
  [`docs/email-setup-and-test.md`](docs/email-setup-and-test.md).
- Whether Groq accepts your key and still serves the configured model.

None of these can be answered from the repository, and none of them is claimed
to be answered here.
