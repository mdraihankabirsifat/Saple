# Saple Backend

The Saple backend is the current read-only API milestone. It connects Express to the existing Oracle 19c schema and provides health checks plus public company, benefit, and salary-summary data for the frontend.

Authentication, contribution, verification, reporting, and moderation routes are not implemented yet.

## Prerequisites

- Node.js 18 or newer
- npm
- Oracle Database 19c with the Saple schema already created
- Network access from Node.js to the Oracle listener

The backend uses node-oracledb Thin mode, so Oracle Instant Client is not required for the current endpoints.

## Install Packages

From the `backend` directory:

```bash
npm install
```

## Environment Setup

Copy `.env.example` to `.env` and enter the local Oracle credentials:

```env
PORT=3000
DB_USER=SAPLE
DB_PASSWORD=your_local_password
DB_CONNECT_STRING=localhost:1521/ORCLPDB1
DB_POOL_MIN=1
DB_POOL_MAX=5
DB_POOL_INCREMENT=1
```

Never commit `.env` or share its password. The repository `.gitignore` excludes `.env`, `node_modules`, and log files.

`DB_CONNECT_STRING` must match the configured host, listener port, and Oracle service name. The configured database user must own or have access to the Saple tables and views.

## Start the API

Development mode with automatic restart:

```bash
npm run dev
```

Normal start:

```bash
npm start
```

The Oracle pool is initialized before the HTTP server starts. The default API address is `http://localhost:3000`.

## Available Endpoints

| Method | Endpoint | Purpose | Frontend consumer |
| --- | --- | --- | --- |
| GET | `/` | API welcome response | Manual diagnostics |
| GET | `/api/health` | Express process health; does not query Oracle | Manual diagnostics |
| GET | `/api/health/database` | Oracle connection health | Manual diagnostics |
| GET | `/api/companies` | List public companies | Company directory and salary form |
| GET | `/api/companies?search=software` | Search public companies in the backend | Homepage/directory search |
| GET | `/api/companies/:companyId` | Get one public company | Company profile |
| GET | `/api/companies/:companyId/benefits` | Get a company's benefits | Company profile |
| GET | `/api/companies/:companyId/salary-summary` | Get verified and community summaries | Company profile |

All current endpoints are GET-only and return JSON. No write action should be inferred from the frontend's prepared forms.

## Response Envelope

Successful data responses use this general shape:

```json
{
  "success": true,
  "message": "Request completed successfully",
  "data": {}
}
```

Public error responses use a safe message and do not expose raw Oracle details.

The salary-summary endpoint returns both data populations:

```json
{
  "success": true,
  "message": "Salary summary retrieved successfully",
  "data": {
    "companyId": 1,
    "verified": [],
    "community": []
  }
}
```

`verified` contains only approved, verified salary submissions. `community` contains every approved salary submission, including verified and unverified approved records.

## Test with curl

```bash
curl http://localhost:3000/
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/database
curl http://localhost:3000/api/companies
curl "http://localhost:3000/api/companies?search=software"
curl http://localhost:3000/api/companies/1
curl http://localhost:3000/api/companies/1/benefits
curl http://localhost:3000/api/companies/1/salary-summary
```

An invalid company ID returns HTTP 400, a missing company returns HTTP 404, and an unknown endpoint returns HTTP 404.

## Frontend Integration

The frontend expects this API on `http://localhost:3000`, configured in `frontend/js/api.js`. CORS is currently enabled in Express so a separately served frontend can access the API during development.

To run the frontend from the repository root:

```bash
python -m http.server 5500 --directory frontend
```

Then open `http://localhost:5500/index.html` while this backend is running.

The frontend preserves backend-powered company search; it does not download the full directory and replace API search with client-only filtering.

## Endpoints Not Yet Implemented

The frontend is prepared for future contracts approximately like:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- A job-role lookup endpoint, such as `GET /api/job-roles`
- `POST /api/companies/:companyId/salaries`

These are future contracts, not currently mounted routes. Review, interview, employee-verification, report, and moderation endpoints also remain future work.

## Common Oracle Connection Problems

- `ORA-01017`: Check `DB_USER` and `DB_PASSWORD`.
- `ORA-12154`: Check the connect-string format and Oracle service name.
- `ORA-12514`: Confirm the requested service is registered with the listener.
- `ORA-12541`: Confirm Oracle is running and the listener host and port are correct.
- Missing database configuration: Set every required value in `.env`; an empty password is treated as missing.
- Invalid pool configuration: Ensure the minimum is not greater than the maximum and increments are positive.
- Table or view not found: Confirm the API connected as the schema owner or a user with the required grants.

Raw Oracle errors are logged only on the server and are not returned to API clients.

## Backend Structure

```text
backend/
|-- config/          # Oracle pool management
|-- controllers/     # HTTP request and response handling
|-- middleware/      # 404 and centralized error handling
|-- repositories/    # Oracle SQL and connection release
|-- routes/          # Express endpoint definitions
|-- services/        # Validation and application rules
|-- utils/           # Response helpers
|-- app.js           # Express configuration and mounted routes
|-- server.js        # Database initialization and process lifecycle
|-- package.json     # Runtime and development scripts
`-- README.md        # Backend setup and API reference
```

## Security Notes

- Keep `backend/.env` local and untracked.
- Do not log or return database passwords.
- Do not expose raw Oracle errors through HTTP responses.
- Add authentication and authorization before introducing write routes.
- Preserve the database's privacy-safe public views when expanding read endpoints.
