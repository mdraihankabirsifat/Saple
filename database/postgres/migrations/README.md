# Saple PostgreSQL migrations

These migrations upgrade an **existing** Supabase PostgreSQL project from the
14-table Saple schema to the final 21-table schema without touching a single
existing row.

A brand-new installation does **not** need them: `01_final_schema_postgres.sql`
already creates the final state. Both paths end at the same schema, which
`backend/tests/postgres-migration.test.js` verifies file-by-file.

## Order

Run exactly once, in this order, in the Supabase SQL editor or `psql`:

| # | File | Adds |
|---|------|------|
| 1 | `001_account_roles_and_company_representatives.sql` | `COMPANY_REPRESENTATIVE` account role, `company_representatives`, `representative_assignment_actions` |
| 2 | `002_jobs_and_applications.sql` | `job_postings`, `job_applications`, `job_application_status_history` |
| 3 | `003_announcements_and_notifications.sql` | `announcements`, `notifications` |
| 4 | `004_public_job_views_and_grants.sql` | `vw_public_open_jobs`, refreshed Supabase role revocation |

Each file is a single transaction. If one fails, nothing in it is applied.

## Safety properties

- **Additive only.** No `DROP TABLE`, no `DELETE`, no `UPDATE` of existing rows.
  The only `ALTER` on an existing table widens `users.account_role` from
  `VARCHAR(10)` to `VARCHAR(25)` and replaces its `CHECK` with a wider one, so
  every existing `USER` and `ADMIN` row stays valid.
- **Re-runnable.** Every new object uses `IF NOT EXISTS` or
  `CREATE OR REPLACE`, so a partial re-run is harmless.
- **Audit-preserving.** History tables and applications use
  `ON DELETE RESTRICT`, never `CASCADE`, so closing or archiving a job cannot
  destroy its applications or decision trail. `ON DELETE CASCADE` appears only
  where a row is genuinely private to one account (`notifications.user_id`,
  `company_representatives.user_id`).

## Before running on the live project

1. Take a Supabase backup, or restore a copy into a scratch project first.
2. Apply all four files to the scratch project.
3. Run `03_schema_and_data_demo_postgres.sql` there and confirm section 1
   reports **21 base tables and 5 views**.
4. Only then apply the same four files to the live project.

## After running

**Do not load `02_final_demo_data_postgres.sql` into a migrated project.** It is
for fresh installs only. Its original section is not re-runnable, and its
synthetic rows use explicit IDs (for example users 8–11) that would collide with
real accounts in an existing project — a demo representative assignment could
end up attached to a real person.

On a migrated project, create representatives, vacancies and announcements
through the application instead, or run the live workflow
`npm run test:integration:jobs` from `backend/`, which creates uniquely named
test accounts, exercises every new table through the API, and deletes what it
created.
