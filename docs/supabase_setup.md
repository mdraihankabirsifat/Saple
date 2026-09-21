# Supabase PostgreSQL Setup

Saple uses Supabase only as a hosted PostgreSQL database. Authentication remains in the Express backend with BCrypt, JWT, and database-backed token versions. The browser must never receive a database password, service-role key, or direct Supabase client.

## 1. Create the project

1. Create a Supabase project.
2. In **Project Settings > Database**, copy a PostgreSQL connection string.
3. For a persistent Render service on an IPv4 network, prefer the Session pooler string when direct connectivity is unsuitable. Copy the exact value from **Connect** and replace its password placeholder privately.
4. Never paste the connection string into source, documentation, screenshots, or Git.

## 2. Create the database

Open the Supabase SQL editor and execute these files in order:

1. `database/postgres/01_final_schema_postgres.sql`
2. `database/postgres/02_final_demo_data_postgres.sql`
3. `database/postgres/03_schema_and_data_demo_postgres.sql`

The third file is read-only validation. The first two target a fresh project; do not rerun them against a populated database unless you intend to rebuild it.

The original Oracle files under `database/sql/` are preserved for the earlier course milestone. The active backend does not execute them.

> **Already have a Saple project on Supabase?** Do not run the files above on it.
> Apply the four additive migrations in `database/postgres/migrations/` instead,
> following that folder's README, and rehearse on a backup first. The final
> schema has 21 tables and 5 views.

## 3. Configure the backend

From `backend/`, copy `.env.example` to `.env`. Preserve any existing local SMTP values and set:

```env
PORT=3000
DATABASE_URL=postgresql://postgres.project_ref:your_private_password@your_pooler_host:5432/postgres
DB_SSL=true
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=10000
# localhost and 127.0.0.1 on ports 5500 and 5501 are always allowed; list only extra origins.
CORS_ORIGINS=
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
```

Keep the existing SMTP, frontend URL, and password-reset TTL settings from `.env.example`. The real `backend/.env` is ignored by Git.

For a local PostgreSQL server that does not use TLS, set `DB_SSL=false`. Supabase normally requires `DB_SSL=true`.

## 4. Install and start

```bash
cd backend
npm install
npm run dev
```

In a second terminal from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Open `http://localhost:5500/index.html`.

## 5. Verify the runtime

Check:

```text
GET http://localhost:3000/api/health
GET http://localhost:3000/api/health/database
GET http://localhost:3000/api/companies
GET http://localhost:3000/api/job-roles
```

The database health endpoint runs `SELECT 1` and returns no connection details.

Run automated checks:

```bash
cd backend
npm test
npm run test:integration
```

The integration workflow requires a working `DATABASE_URL` and `JWT_SECRET`. It creates temporary users, exercises the complete workflow, and cleans those users up.

## 6. Provision viva accounts

Set private demo passwords in `backend/.env`:

```env
DEMO_NORMAL_PASSWORD=choose_a_private_password
DEMO_EMPLOYEE_PASSWORD=choose_a_private_password
DEMO_ADMIN_PASSWORD=choose_a_private_password
```

Optional email overrides are listed in `.env.example`. Then run:

```bash
cd backend
npm run provision:demo-users
```

Public registration always creates `account_role = USER`. Only this internal server-side script provisions the ADMIN demo account. It hashes all passwords with BCrypt and never prints them.

The EMPLOYEE account still needs an approved company-role verification before it can contribute; ADMIN status does not grant that verification.

## Public deployment

For one-origin Render hosting, follow [deployment.md](deployment.md). Do not rerun the schema or seed merely to deploy an already populated Supabase project.

## 7. Supabase security model

- Express is the only application database client.
- Frontend code contains no Supabase URL, anon key, service-role key, or database credential.
- Repository SQL uses positional parameters (`$1`, `$2`, and so on).
- No ORM or Supabase Auth is used.
- Do not create permissive RLS policies merely to silence dashboard warnings.
- The schema revokes table access from Supabase browser roles when those roles exist. The server-side database connection remains authoritative.

If Supabase reports public-schema/RLS advisories, document: “Database is accessed server-side through the Express backend. The browser has no direct database access.”

## 8. Common failures

- **Missing DATABASE_URL**: add it to ignored `backend/.env` and restart.
- **TLS/certificate failure**: confirm `DB_SSL=true` for Supabase.
- **Password contains URL-special characters**: use the exact encoded connection string supplied by Supabase.
- **Connection saturation**: use the pooler URL and keep `DB_POOL_MAX` conservative.
- **JWT_SECRET is required**: set a long random value in `backend/.env`; never add a fallback in JavaScript.
