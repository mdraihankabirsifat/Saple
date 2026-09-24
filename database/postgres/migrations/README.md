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
| 5 | `005_cse216_final_database_features.sql` | `saple_set_updated_at()` and seven `trg_*_set_updated_at` triggers, `saple_company_insight_summary()`, `saple_apply_application_decision()` |

Migration 005 is the only one a **fresh** installation also needs to care
about, and it does not have to run it: `01_final_schema_postgres.sql` already
contains the same three objects. Run 005 when you are upgrading a database that
was created before them.

Each file is a single transaction. If one fails, nothing in it is applied.

## Safety properties

- **Additive only.** No `DROP TABLE`, no `DELETE`, no `UPDATE` of existing rows.
  Migration 005 adds no table and no row at all: it installs one trigger
  function with its triggers, one statistical function and one procedure. The
  `DROP TRIGGER IF EXISTS` / `DROP FUNCTION IF EXISTS` / `DROP PROCEDURE IF EXISTS`
  lines in it remove only those objects before recreating them, which is what
  makes the file re-runnable.
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
2. Apply all five files to the scratch project, in order.
3. Run `03_schema_and_data_demo_postgres.sql` there and confirm section 1
   reports **21 base tables and 5 views**, and that its last two sections list
   the three `saple_*` routines and the seven `trg_*_set_updated_at` triggers.
4. Only then apply the same five files to the live project.

### Verifying migration 005

```sql
-- One trigger function, one statistical function, one procedure.
SELECT p.proname, p.prokind            -- 'f' = function, 'p' = procedure
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'saple%'
ORDER BY p.proname;

-- Seven timestamp triggers, one per table that has updated_at.
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
ORDER BY c.relname;

-- The statistical function, on any company id that exists.
SELECT * FROM saple_company_insight_summary((SELECT MIN(company_id) FROM companies));
```

The procedure changes data, so demonstrate it only on a disposable database or
on a synthetic application row you created for the purpose:

```sql
BEGIN;
CALL saple_apply_application_decision(
  <application_id>, <actor_user_id>, 'UNDER_REVIEW', 'demonstration',
  ARRAY['SUBMITTED']::VARCHAR[], TRUE, NULL, NULL, NULL, NULL);
SELECT application_status, updated_at FROM job_applications WHERE application_id = <application_id>;
SELECT previous_status, new_status FROM job_application_status_history
 WHERE application_id = <application_id> ORDER BY history_id DESC LIMIT 1;
ROLLBACK;  -- or COMMIT to keep the decision
```

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
