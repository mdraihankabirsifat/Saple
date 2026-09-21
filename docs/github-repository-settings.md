# Suggested GitHub repository settings

**Written for:** the repository owner, for the settings only they can change
on GitHub.

## About box

**Description** (under 350 characters):

> Saple — an independent BUET CSE academic project for company and career
> insights: moderated reviews, verified and community salary ranges, interview
> experiences and job postings. Express + PostgreSQL + vanilla JavaScript.

**Website:** leave empty until the new Render service is live and its Search
Console Security Issues report is clean. Then set it to the new service URL,
for example `https://saple-academic.onrender.com`. Do not link the old,
deleted service.

**Topics:**

```
postgresql  supabase  express  nodejs  vanilla-javascript  database-project
academic-project  buet  salary-insights  company-reviews  job-board
rbac  content-security-policy
```

## Licence — a decision for you

No `LICENSE` file has been added. Nothing in the repository says who holds the
copyright or whether every contributor has agreed to a licence, and choosing
one on the team's behalf would be inventing that consent.

Until you add one, default copyright applies: people can read the code on
GitHub but have no permission to reuse it. Common choices for a course project:

| Licence | Effect |
|---------|--------|
| MIT | Anyone may reuse the code with attribution. Short and permissive. |
| Apache-2.0 | Like MIT, plus an explicit patent grant. |
| No licence | Readable, not reusable. Fine if the course or team prefers it. |

If you pick one, confirm with every team member first, then add it with
GitHub's **Add file → Create new file → `LICENSE` → Choose a license
template**. Check your course's rules on publishing coursework before choosing
a permissive licence.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

- the Node test suite (`npm test`) on the supported Node version;
- `npm audit --omit=dev --audit-level=high`;
- `git diff --check` and a scan for accidentally committed secrets;
- the ML unit tests.

It needs no secrets. The live database, SMTP and AI checks are deliberately not
part of it: they need real credentials and must be run by you, locally, against
a project you control. If you ever add them to CI, store the values as
**encrypted repository secrets**, restrict the job to a protected branch or a
manual trigger, and never print them.

## Branch protection (optional)

On **Settings → Branches**, protecting `main` with "Require status checks to
pass" (select the CI job) stops a failing build from being merged — useful
before a deployment that auto-deploys from `main`.
