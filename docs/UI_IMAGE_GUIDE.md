# UI image guide

**Written for:** whoever replaces or adds images in Saple.

## Rules for any image

- **Local files only.** Put the file under `frontend/assets/` and reference it
  with a relative path. The Content-Security-Policy allows images from the
  site itself (`img-src 'self'`), so a hotlinked image would simply not load.
- **Compressed.** Aim for under 300 KB per image; WebP for new files.
- **Rights you actually have.** Your own photo, a generated illustration, or a
  licence that allows reuse. No logos or brand imagery of the companies Saple
  lists, and nothing copied from another site.
- **No people's faces from the web**, and nothing that suggests Saple is an
  official service of any company.

## Images in use

Every page image is a CSS background in `frontend/css/premium.css`, drawn
behind a colour wash so text stays readable in both themes.

| Where | File | Set in `premium.css` by |
|-------|------|-------------------------|
| Homepage hero | `frontend/assets/hero/homepage.png` | `.home-hero-background` |
| Sign in | `frontend/assets/hero/login.png` | `.auth-main.login-main::before` |
| Create account | `frontend/assets/hero/singup.png` | `.auth-main.register-main::before` |
| Companies header | `frontend/assets/hero/companies.png` | `.page-art-companies` |
| Salaries header | `frontend/assets/hero/salaries.png` | `.page-art-salaries` |
| Reviews header | `frontend/assets/hero/Reviews.png` | `.page-art-reviews` |
| Interviews header | `frontend/assets/hero/Interviews.png` | `.page-art-interviews` |
| Jobs header | `frontend/assets/hero/job.png` | `.page-art-jobs` |
| FAQ, About and Contact headers | `frontend/assets/hero/FAQ.png` | `.page-art-faq` |

To replace one, keep the file name and overwrite the file. File names are
case-sensitive on the Cloudflare and Render hosts, so match them exactly
(including `singup.png`).

These files are also listed in the service worker's offline shell
(`ASSETS` in `frontend/sw.js`). Adding, renaming or removing an image means
updating that list and bumping `SHELL_CACHE`; overwriting an existing file
needs neither.

## Optional slots

The forgot-password and reset-password pages each have an
`.auth-visual-slot` holding a small original SVG. To use a picture instead,
add this as the slot's first child (recommended 5:3, 1000 × 600):

```html
<img class="auth-visual-image" src="assets/auth/recovery.webp" alt=""
  decoding="async" loading="lazy">
```

The slot is hidden below 900 px wide, where the form comes first.
`frontend/assets/auth/` and `frontend/assets/ui/` (for future feature-card
images, 16:9) are kept empty for these.

## Company logos

Company marks come from the logo a company representative uploads to Supabase
Storage, or are generated from the company name (initials on a fixed colour)
by `frontend/js/company-logo.js`. Logos are never fetched from third-party
services: letting database content choose which external host a visitor's
browser contacted was removed as part of the Safe Browsing remediation.
