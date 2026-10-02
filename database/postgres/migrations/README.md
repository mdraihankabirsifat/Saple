# Saple PostgreSQL migrations

These migrations upgrade an **existing** Supabase PostgreSQL project from the
14-table Saple schema to the current 39-table schema without touching a single
existing row.

A brand-new installation does **not** need them: `01_final_schema_postgres.sql`
already creates the final state. Both paths end at the same schema, which
`backend/tests/postgres-migration.test.js` verifies file-by-file.

`../04_bulk_demo_data_postgres.sql` and `../05_remove_bulk_demo_data.sql` are
**not** migrations. They are an optional demo-data population script and its
cleanup; see `docs/supabase_setup.md`. Never add them to this folder.

## Order

Run exactly once, in this order, in the Supabase SQL editor or `psql`:

| # | File | Adds |
|---|------|------|
| 1 | `001_account_roles_and_company_representatives.sql` | `COMPANY_REPRESENTATIVE` account role, `company_representatives`, `representative_assignment_actions` |
| 2 | `002_jobs_and_applications.sql` | `job_postings`, `job_applications`, `job_application_status_history` |
| 3 | `003_announcements_and_notifications.sql` | `announcements`, `notifications` |
| 4 | `004_public_job_views_and_grants.sql` | `vw_public_open_jobs`, refreshed Supabase role revocation |
| 5 | `005_cse216_final_database_features.sql` | `saple_set_updated_at()` and seven `trg_*_set_updated_at` triggers, `saple_company_insight_summary()`, `saple_apply_application_decision()` |
| 6 | `006_profile_and_company_images.sql` | nullable Storage object paths for account pictures and company logos |
| 7 | `007_direct_messages.sql` | private direct messages, unread state and supporting indexes |
| 8 | `008_public_profiles_and_search.sql` | `users.headline` and `users.bio`; professional-profile sections `user_education`, `user_experience`, `skills` and `user_skills` |
| 9 | `009_premium_subscriptions.sql` | Saple Premium: `premium_plans` (seeded 1-month and 3-month plans), `premium_trial_claims`, `premium_promo_codes`, `premium_payments`, `premium_access_periods`, `premium_promo_redemptions`, `profile_views`, `premium_ai_usage`; `job_postings.access_level` (existing vacancies stay `FREE`); two Premium notification types; `vw_public_open_jobs` gains `access_level` |
| 10 | `010_job_application_resumes.sql` | `job_application_resumes`: the optional PDF resume (at most 2 MB, `BYTEA`, SHA-256 recorded) of one job application |
| 11 | `011_ml_moderation.sql` | ML model registry, versioned content screening, public profile revisions and public visibility/training views; human decisions remain final |
| 12 | `012_admin_control_center.sql` | Admin audit, account status metadata, revocable trials and manual Premium access without payment records |

The fresh schema already includes all twelve migrations' tables, columns,
views and routines. Run only the migrations that an existing database has not
yet received.

Each file is a single transaction. If one fails, nothing in it is applied.

## Safety properties

- **Additive only.** No `DROP TABLE`, no `DELETE`, no `UPDATE` of existing rows.
  Migration 005 adds no table and no row at all: it installs one trigger
  function with its triggers, one statistical function and one procedure. The
  `DROP TRIGGER IF EXISTS` / `DROP FUNCTION IF EXISTS` / `DROP PROCEDURE IF EXISTS`
  lines in it remove only those objects before recreating them, which is what
  makes the file re-runnable.
  Migration 001 widens `users.account_role` and its check. Migration 006 adds
  nullable image paths to `users` and `companies`. Migration 009 adds
  `job_postings.access_level` with a `FREE` default and widens the notification
  type check. Existing rows stay valid.
- **Re-runnable.** Every new object uses `IF NOT EXISTS` or
  `CREATE OR REPLACE`, so a partial re-run is harmless.
- **Audit-preserving.** History tables and applications use
  `ON DELETE RESTRICT`, never `CASCADE`, so closing or archiving a job cannot
  destroy its applications or decision trail. `ON DELETE CASCADE` appears only
  where a row is genuinely private to one account (`notifications.user_id`,
  `company_representatives.user_id`, and the two per-account Premium usage
  tables `profile_views` and `premium_ai_usage`, and the applicant's own
  resume file in `job_application_resumes`). Payments, access periods,
  trial claims and promo redemptions are never cascade-deleted.

## Before running on the live project

1. Take a Supabase backup, or restore a copy into a scratch project first.
2. Apply all twelve files to the scratch project, in order.
3. Run `03_schema_and_data_demo_postgres.sql` there and confirm section 1
   reports **39 base tables and 7 views**, and that its last two sections list
   the three `saple_*` routines and the seven `trg_*_set_updated_at` triggers.
4. Apply only missing files to the live project. If migrations 001 through 011 have
   already been applied, run only `012_admin_control_center.sql` in Supabase SQL
   Editor before deploying this backend. Never apply migrations automatically.

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
