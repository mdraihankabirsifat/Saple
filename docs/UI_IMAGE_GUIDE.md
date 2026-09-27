# UI image guide

**Written for:** whoever adds photographs or illustrations to Saple later.

Every area below already looks finished without an image: each has a layered
background, a grid texture and, where it helps, a small original SVG. An image
is an optional upgrade, never a missing piece.

## Rules for any image

- **Local files only.** Put the file in the folder listed below and reference
  it with a relative path. The Content-Security-Policy allows images from the
  site itself (`img-src 'self'`), so a hotlinked image would simply not load.
- **WebP, compressed.** Aim for under 200 KB per image.
- **Rights you actually have.** Your own photo, a generated illustration, or a
  licence that allows reuse. No logos or brand imagery of the companies Saple
  lists, and nothing copied from another site.
- **No people's faces from the web**, and nothing that suggests Saple is an
  official service of any company.
- Always add `decoding="async"`; add `loading="lazy"` to anything below the
  first screen.

## Where images can go

| Page / section | Image type | Aspect ratio | Suggested size | File to create | Optional |
|---|---|---|---|---|---|
| Homepage background (`index.html`, `.home-hero-background`) | Editorial illustration or photo: a workspace, a growing plant, an abstract data-and-leaf composition | 16:9 | 1672 × 941 | `frontend/assets/hero/homepage.png` | Optional — the four-edge fade keeps the hero usable without it |
| Sign in (`login.html`, `.auth-scene`) | Calm botanical desk scene | 4:3 | 1000 × 750 | `frontend/assets/auth/login.webp` | Yes — an original SVG desk scene is there now; replace the `<svg>` inside `.auth-scene` with an `<img>` to use a file |
| Register (`register.html`, `.auth-visual-slot`) | Illustration about contributing or joining | 5:3 | 1000 × 600 | `frontend/assets/auth/register.webp` | Yes |
| Forgot / reset password (`.auth-visual-slot`) | Quiet illustration: a key, a leaf, an envelope | 5:3 | 1000 × 600 | `frontend/assets/auth/recovery.webp` | Yes |
| Editorial or feature cards (future) | Photo or illustration per topic | 16:9 | 1280 × 720 | `frontend/assets/ui/<topic>.webp` | Yes |

### Adding the homepage hero image

The supplied `frontend/assets/hero/homepage.png` is already used as the
homepage hero background. CSS fades all four edges into Saple's page surface,
and the artwork is intentionally low-contrast so the search and calls to
action remain readable. Replace that file with another local 16:9 image if
you want a different background.

### Adding an auth image

Add as the first child of `<div class="auth-visual-slot">` on the page:

```html
<img class="auth-visual-image" src="assets/auth/register.webp" alt=""
  decoding="async" loading="lazy">
```

The slot is hidden below 900 px wide, where the form comes first.

## Company logos: deliberately not images

Company marks are generated from the company name (initials on a fixed colour)
by `frontend/js/company-logo.js`. That is intentional: fetching logos from a
third-party service let database content choose which external host a
visitor's browser contacted, and removing it was part of the Safe Browsing
remediation. Showing real company logos would also suggest an affiliation
Saple does not have. **Keep the generated marks.**

## Nothing here needs an image to be correct

No page has a blank box, a placeholder label or a broken-image icon waiting
for a file. Add images when you have good ones, not to fill space.
