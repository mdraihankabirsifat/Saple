# Cloudflare Workers deployment

Saple supports Cloudflare Workers as a second hosting target. Render, local
Node, and the local PostgreSQL fallback continue to use `backend/server.js` and
the existing `pg.Pool`. Cloudflare uses [`cloudflare/worker.mjs`](../cloudflare/worker.mjs),
the same `backend/app.js`, and a short-lived `pg.Client` connected through
Hyperdrive to the existing Supabase PostgreSQL database.

```text
Browser → Worker Static Assets (frontend/)
              │
              └─ /api/* and generated text routes → shared Express app
                                                       │
                                                       └─ pg.Client → Hyperdrive → existing Supabase PostgreSQL
```

The Worker does not use D1, KV, Durable Objects, R2, a second message table, or
a separate API host. Ordinary HTML, CSS, JavaScript and image requests are
served directly by Worker Static Assets. Do not enable SPA fallback: Saple is a
multi-page application. Static security headers are supplied by
[`frontend/_headers`](../frontend/_headers); update its Supabase image origin if
the project uses a non-`supabase.co` Storage hostname.

## 1. Create Hyperdrive for the existing database

Use the Supabase project that already backs Saple. In Supabase, open **Connect**
and copy a PostgreSQL connection string, replacing only its password privately.
The connection string must never be committed or placed in a Worker variable.

From the repository root, create the Hyperdrive configuration:

```powershell
npx wrangler hyperdrive create saple-supabase --connection-string="postgres://USER:PASSWORD@HOST:5432/DATABASE"
```

Use the exact host, port, database and URL-encoded password supplied by
Supabase. The command prints a Hyperdrive ID. Replace the all-zero placeholder
in `wrangler.jsonc` with that ID. The ID is a binding identifier and is safe to
commit; the source connection string is not.

The same operation is available in the Cloudflare Dashboard under **Storage &
Databases → Hyperdrive → Create configuration**. Select PostgreSQL, enter the
existing Supabase connection details, and copy the resulting configuration ID
to `wrangler.jsonc`.

## 2. Install and configure the Worker

```powershell
npm install
npm run cf:install
```

The root `package.json` owns Wrangler. The backend keeps its own package and
lockfile; `cf:install` installs those dependencies so Wrangler can bundle the
shared Express modules.

Set Worker secrets without putting values in Git. Repeat for every value used by
the deployment:

```powershell
npx wrangler secret put JWT_SECRET
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put SMTP_PASS
npx wrangler secret put AI_API_KEY
```

Add the remaining text secrets through the Dashboard or `wrangler secret put`:
`DATABASE_URL` is not required for Worker queries because Hyperdrive supplies
the connection, and must not be added for this purpose.

Non-secret variables can be entered under **Worker → Settings → Variables and
Secrets**:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_URL` | Public Worker origin, including `https://` and a trailing slash if desired |
| `CORS_ORIGINS` | Optional comma-separated exact additional origins |
| `SECURITY_CONTACT` | Address published by `security.txt` |
| `JWT_EXPIRES_IN` | JWT lifetime, normally `1d` |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | Reset-link lifetime |
| `AI_ENABLED` | `true` or `false` |
| `AI_API_BASE_URL` | Credential-free HTTPS OpenAI-compatible endpoint |
| `AI_MODEL` | Provider model name |
| `AI_TIMEOUT_MS` / `AI_MAX_OUTPUT_TOKENS` | Existing AI limits |
| `SUPABASE_URL` | Supabase project URL used for Storage public URLs |
| `SUPABASE_AVATAR_BUCKET` | Avatar bucket name, normally `avatar` |
| `SUPABASE_COMPANY_LOGO_BUCKET` | Company-logo bucket name, normally `Company_logos` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM` | Existing mail transport settings |

Keep `SAPLE_RUNTIME=cloudflare`, `DB_FALLBACK_ENABLED=false`, and
`DB_PRIMARY_SOURCE=supabase` as the values in `wrangler.jsonc`. The Worker never
attempts localhost or the local fallback.

## 3. Deploy

After replacing the Hyperdrive ID:

```powershell
npm run cf:deploy
```

For a local bundle check without publishing:

```powershell
npm run cf:dry-run
```

For local Wrangler development against the local Docker PostgreSQL, set the
binding-specific connection string privately. The value is read only by
Wrangler and is not committed:

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "postgres://USER:PASSWORD@127.0.0.1:5433/saple_local"
npm run cf:dev -- --persist-to D:\wrangler-state-saple
```

Use a remote Hyperdrive binding when testing against the hosted Supabase
database instead:

```powershell
npm run cf:dev -- --remote
```

The normal Node workflow remains independent:

```powershell
cd backend
npm start
npm test
```

## 4. Verify the deployment

Open the Worker URL and check these in order:

1. `/` and `/index.html` load the current static homepage.
2. `/api` returns the API welcome JSON.
3. `/api/health` returns `200` JSON.
4. `/api/health/database` returns `200` with `source: "hyperdrive"` and no connection details.
5. `/api/companies` and `/api/jobs` return public Supabase data.
6. Register, log in, and open `/api/auth/me`.
7. Open the Saple Guide status and send a message if AI is enabled.
8. Send, edit, delete and poll a direct message between two accounts.
9. Upload/remove an avatar and a representative company logo.
10. Exercise representative applications and protected admin endpoints.
11. Request a password reset and verify delivery.
12. Check `/robots.txt`, `/sitemap.xml`, `/security.txt` and `/.well-known/security.txt`.

The frontend keeps same-origin API resolution, so it calls
`https://YOUR_WORKER.workers.dev/api/...` without a hard-coded hostname.

## Compatibility notes

- `pg` is already `8.23.0`, above Hyperdrive's supported minimum. Worker mode
  creates one client per query/transaction and closes it; Node mode still uses
  the existing pool and transaction boundaries.
- Authentication now uses `bcryptjs`, which verifies existing standard bcrypt
  hashes and avoids a native addon in Workers. No password format or JWT claim
  changed.
- Supabase Storage remains HTTPS through the existing backend-only client. R2 is
  not used, and the secret key is never sent to the browser.
- `multer` remains the existing in-memory multipart path. Run the dry-run and
  an authenticated upload against the Worker before treating image uploads as
  production-ready.
- Nodemailer/SMTP remains the Node/Render transport. Cloudflare Workers do not
  provide a general SMTP socket environment; if the current bundle rejects the
  transport, password recovery returns its existing controlled `503` on the
  Worker while Node/Render continues to send mail. Do not fake delivery or move
  SMTP credentials into client code.
- In-memory rate limits are per Worker isolate. Authentication, authorization,
  validation and all database constraints remain enforced; a distributed rate
  limiter can be added later if the deployment needs cross-isolate quotas.

## Render and local remain available

Do not change `render.yaml`, delete `backend/server.js`, or replace
`DATABASE_URL`. Render continues to build with `npm ci --omit=dev --prefix
backend` and start with `npm start --prefix backend`. Local Docker continues to
use `compose.local.yaml`, and its optional Supabase-to-local fallback remains a
Node-only feature.
