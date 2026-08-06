# Saple Backend

This directory contains the first read-only backend milestone for Saple. It provides health checks and public company information from the existing Oracle 19c schema.

## Prerequisites

- Node.js 18 or newer
- npm
- Oracle Database 19c with the Saple schema already created
- Network access from this application to the Oracle listener

The backend uses node-oracledb Thin mode, so Oracle Instant Client is not required for these endpoints.

## Install Packages

From the `backend` directory, run:

```bash
npm install
```

## Environment Setup

Copy `.env.example` to `.env` and enter the local database password:

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

The value of `DB_CONNECT_STRING` must match the host, listener port, and service name configured for the local Oracle database. The SAPLE user must have access to the existing tables and views.

## Start the API

Development mode with automatic restart:

```bash
npm run dev
```

Normal start:

```bash
npm start
```

The database pool is initialized before the HTTP server starts. By default, the API is available at `http://localhost:3000`.

## Available Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/` | API welcome response |
| GET | `/api/health` | API process health; does not query Oracle |
| GET | `/api/health/database` | Oracle connection health |
| GET | `/api/companies` | List public companies |
| GET | `/api/companies?search=software` | Search public companies |
| GET | `/api/companies/:companyId` | Get one company |
| GET | `/api/companies/:companyId/benefits` | Get a company's benefits |
| GET | `/api/companies/:companyId/salary-summary` | Get verified and community salary summaries |

All endpoints return JSON. This milestone intentionally provides no write, authentication, verification, report, or moderation endpoints.

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

The root response is:

```json
{
  "success": true,
  "message": "Welcome to the Saple API"
}
```

The database health response is:

```json
{
  "success": true,
  "message": "Oracle database connection is healthy",
  "data": {
    "connectionTest": 1
  }
}
```

The salary-summary response follows this shape:

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

An invalid company ID returns HTTP 400, a missing company returns HTTP 404, and an unknown endpoint returns HTTP 404.

## Common Oracle Connection Problems

- `ORA-01017`: Check `DB_USER` and `DB_PASSWORD`.
- `ORA-12154`: Check the connect-string format and Oracle service name.
- `ORA-12514`: Confirm the requested service is registered with the listener.
- `ORA-12541`: Confirm Oracle is running and the listener host and port are correct.
- Missing database configuration: Set every required value in `.env`; an empty password is treated as missing.
- Table or view not found: Confirm the API connected as the schema owner or a user with the required grants.

Raw Oracle errors are logged only on the server and are not returned to API clients.

## Backend Structure

```text
backend/
├── config/          # Oracle pool management
├── controllers/     # HTTP request and response handling
├── middleware/      # 404 and centralized error handling
├── repositories/    # Oracle SQL and connection release
├── routes/          # Endpoint definitions
├── services/        # Validation and application rules
├── utils/           # Small response helper
├── app.js           # Express configuration
└── server.js        # Database initialization and process lifecycle
```
