# Saple Backend

The Saple backend connects Express 5 to Oracle 19c. It preserves the existing public company GET API and adds registration, JWT login, current-user lookup, public job-role lookup, and an authenticated transactional salary-submission endpoint.

## Prerequisites

- Node.js 18 or newer
- npm
- Oracle Database 19c with the Saple schema and sample-data identity synchronization applied
- Network access from Node.js to the Oracle listener

node-oracledb uses Thin mode, so Oracle Instant Client is not required.

## Install and Configure

From `backend/`:

```bash
npm install
```

Copy `.env.example` to `.env` and provide local values:

```env
PORT=3000
DB_USER=SAPLE
DB_PASSWORD=your_local_password
DB_CONNECT_STRING=localhost:1521/ORCLPDB
DB_POOL_MIN=1
DB_POOL_MAX=5
DB_POOL_INCREMENT=1
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
```

`JWT_SECRET` is required for login and protected routes. Use a long, unpredictable value and never commit it. `JWT_EXPIRES_IN` accepts a jsonwebtoken duration such as `1d`.

## Start the API

```bash
npm run dev
# or
npm start
```

The Oracle pool initializes before the HTTP server. The default address is `http://localhost:3000`.

## Available Endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | Public | API welcome response |
| GET | `/api/health` | Public | Express process health |
| GET | `/api/health/database` | Public | Oracle connection health |
| GET | `/api/companies` | Public | List/search companies (`?search=term`) |
| GET | `/api/companies/:companyId` | Public | Get one company |
| GET | `/api/companies/:companyId/benefits` | Public | Get company benefits |
| GET | `/api/companies/:companyId/salary-summary` | Public | Get verified and community summaries |
| POST | `/api/auth/register` | Public | Create a `NORMAL` or `EMPLOYEE` account |
| POST | `/api/auth/login` | Public | Return a signed JWT and safe user object |
| GET | `/api/auth/me` | Bearer token | Return the active current user |
| GET | `/api/job-roles` | Public | List controlled job-role values |
| POST | `/api/companies/:companyId/salaries` | Bearer token | Create a pending salary contribution |

Successful responses use `{ "success": true, "message": "...", "data": ... }`. Errors use a safe public message without raw Oracle details.

## Authentication Contracts

Register a job seeker:

```json
{
  "fullName": "Sample User",
  "email": "sample@example.com",
  "password": "example123",
  "userType": "NORMAL"
}
```

For `userType: "EMPLOYEE"`, also send `employmentStatus: "CURRENT"` or `"FORMER"`. Registration lowercases and trims email, rejects duplicate email with `409`, hashes the password with BCrypt (12 rounds), creates employee metadata in the same transaction when required, and never accepts a public administrator role.

Login accepts `email` and `password`. Invalid credentials and unavailable accounts return the same `401` message. A successful response includes a minimal HS256 JWT containing `userId` and `role`, plus a safe user object without `password_hash`. The token is restricted by issuer, audience, algorithm, and expiry.

Use the token on protected routes:

```text
Authorization: Bearer <token>
```

## Salary Submission Contract

`POST /api/companies/:companyId/salaries` accepts:

```json
{
  "roleId": 1,
  "baseSalary": 85000,
  "additionalCompensation": 5000,
  "currency": "BDT",
  "payPeriod": "MONTHLY",
  "yearsOfExperience": 2.5,
  "employmentType": "FULL_TIME",
  "workMode": "HYBRID",
  "salaryYear": 2026,
  "isAnonymous": true
}
```

The service validates database-compatible IDs, numeric ranges/precision, uppercase currency, enumerated values, salary year, and the boolean anonymous flag. Missing companies or roles return `404`; invalid input returns `400`; a missing/invalid token returns `401`.

### Transaction boundary

The repository acquires one Oracle connection and performs this atomic unit:

```text
validate active user/company/role
              |
              v
insert SUBMISSIONS parent (type SALARY, status PENDING)
              |
              v
insert SALARY_SUBMISSIONS child with the returned submission_id
              |
              v
            COMMIT
```

Any failure rolls back the complete unit, so an orphan parent cannot remain. The same connection is always closed in `finally`, and SQL uses bind variables. Verification is `VERIFIED` only when an active, non-expired, company-specific verified-employment record exists; otherwise it is `UNVERIFIED`. The endpoint never self-approves a submission.

## Identity Synchronization

The sample script inserts explicit identity values. After its sample-data `COMMIT`, it runs Oracle `START WITH LIMIT VALUE` for:

- `USERS.USER_ID`
- `EMPLOYEES.EMPLOYEE_ID`
- `SUBMISSIONS.SUBMISSION_ID`

This is the only schema-related correction in this milestone. It advances each generator beyond its existing maximum, preventing generated-ID collisions without changing table definitions.

## Architecture

Application flow is `routes -> controllers -> services -> repositories`. Controllers translate HTTP input/output, services own validation and application rules, and repositories contain all Oracle SQL and transaction/connection handling.

```text
backend/
|-- config/          # Oracle pool and JWT settings
|-- controllers/     # HTTP request/response handling
|-- middleware/      # Authentication, 404, and centralized errors
|-- repositories/    # All Oracle SQL and transaction handling
|-- routes/          # Express endpoints
|-- services/        # Validation and application rules
|-- tests/           # Unit and opt-in live Oracle integration tests
|-- utils/           # Response and HTTP-error helpers
|-- app.js           # Express configuration and mounted routes
`-- server.js        # Pool initialization and process lifecycle
```

## Tests

Run unit tests:

```bash
npm test
```

Run the real HTTP + Oracle workflow test with a configured `.env`:

```bash
npm run test:integration
```

The integration test creates uniquely named test accounts, cleans them afterward, and verifies:

- generated user, employee, and submission IDs exceed sample-data maximums;
- password hashes are not plaintext;
- normal/employee registration, duplicate and validation errors, login, and `/me`;
- job-role lookup and authenticated salary submission;
- matching parent/child submission IDs and exact `PENDING`/verification state;
- a forced child insert failure rolls back its parent;
- pending submissions do not change public salary aggregates;
- all pre-existing health, company, search, detail, benefit, and summary GETs still work.

## curl Examples

```bash
curl http://localhost:3000/api/companies
curl http://localhost:3000/api/job-roles
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sample@example.com","password":"example123"}'
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Common Oracle Connection Problems

- `ORA-01017`: Check `DB_USER` and `DB_PASSWORD`.
- `ORA-12154`: Check the connect-string format and service name.
- `ORA-12514`: Confirm the requested service is registered with the listener.
- `ORA-12541`: Confirm Oracle and its listener are running.
- Table or view not found: Connect as the schema owner or grant the required access.

## Security Notes

- Keep `.env`, database credentials, and the JWT secret local and untracked.
- Password hashes are never selected for public responses.
- Generic login errors reduce account-enumeration leakage.
- Protected routes verify the Bearer token before controller execution.
- SQL uses bind parameters; raw Oracle errors are not returned to clients.
- Public registration cannot create an administrator.

## Deferred Scope

Admin moderation, review submission, interview submission, employee-verification workflows, reporting, ML, and deployment are intentionally outside this milestone.
