# Saple Database Schema - Teacher Presentation Guide

This folder is a clean study and fresh-install representation of the implemented Saple database. The original numbered files in `database/` remain the operational history.

## What the database files mean

- **Oracle schema owner:** the Oracle user that owns Saple's tables, constraints, indexes, and views.
- **Schema DDL:** statements that define database objects and integrity rules.
- **Migrations:** ordered changes that add to an existing schema without rebuilding it.
- **Sample data:** demonstration rows used to make the project easy to explore.
- **Test queries:** checks that inspect data and confirm expected behavior.
- **Views:** saved queries that derive safe public or analytical results from base tables.
- **ERD:** the entity-relationship diagram showing tables, keys, and relationships visually.

`01_create_user.sql` creates the Oracle SAPLE user/schema owner.

`02_create_tables.sql` creates the main database structure.

`06_create_password_reset_tokens.sql` adds password-reset support.

`07_add_role_scoped_verification.sql` adds role-scoped verification.

`03`, `05` and `08` insert data; they do not define the main schema.

`04` contains test queries.

> **Warning:** `01_final_schema.sql` is intended for studying or creating a completely fresh database. Do not execute it in the existing populated SAPLE schema.

## 1. Accounts and identity

### `USERS`

- **Purpose:** Stores login identity, account state, user category, and authorization role.
- **Primary key:** `USER_ID`.
- **Important foreign keys:** None.
- **Relationships:** A user may have one employee profile and may own submissions, password-reset tokens, reports, reviews of verification requests, and moderation actions.

### `EMPLOYEES`

- **Purpose:** Stores the optional employment profile for an employee-type user.
- **Primary key:** `EMPLOYEE_ID`.
- **Important foreign keys:** `USER_ID` references `USERS` and is also unique.
- **Relationships:** Each employee profile belongs to exactly one user and may have many employment-verification records; one user has at most one employee profile.

### `PASSWORD_RESET_TOKENS`

- **Purpose:** Stores single-use, expiring hashes used for account password recovery.
- **Primary key:** `RESET_TOKEN_ID`.
- **Important foreign keys:** `USER_ID` references `USERS`.
- **Relationships:** A user may have many password-reset token records, which are removed if that user is removed.

## 2. Company reference data

### `COMPANIES`

- **Purpose:** Stores the public reference profile for each company.
- **Primary key:** `COMPANY_ID`.
- **Important foreign keys:** None.
- **Relationships:** A company may have benefits, employment verifications, and user submissions.

### `JOB_ROLES`

- **Purpose:** Provides a reusable list of job designations and categories.
- **Primary key:** `ROLE_ID`.
- **Important foreign keys:** None.
- **Relationships:** A role can classify employment verifications and salary, review, or interview contributions.

### `BENEFITS`

- **Purpose:** Provides a reusable catalog of employee benefits.
- **Primary key:** `BENEFIT_ID`.
- **Important foreign keys:** None.
- **Relationships:** A benefit may be offered by many companies through `COMPANY_BENEFITS`.

### `COMPANY_BENEFITS`

- **Purpose:** Resolves the many-to-many relationship between companies and benefits and stores offering details.
- **Primary key:** Composite key (`COMPANY_ID`, `BENEFIT_ID`).
- **Important foreign keys:** `COMPANY_ID` references `COMPANIES`; `BENEFIT_ID` references `BENEFITS`.
- **Relationships:** Each row connects one company to one benefit.

## 3. Employment verification

### `EMPLOYMENT_VERIFICATIONS`

- **Purpose:** Records an employee's verification request and decision for one company and job role.
- **Primary key:** `VERIFICATION_ID`.
- **Important foreign keys:** `EMPLOYEE_ID` references `EMPLOYEES`; `COMPANY_ID` references `COMPANIES`; nullable legacy `ROLE_ID` references `JOB_ROLES`; `REVIEWED_BY` references `USERS`.
- **Relationships:** Each record scopes trust to an employee, company, and job role, with an optional admin reviewer until the request is decided.

## 4. User contributions

### `SUBMISSIONS`

- **Purpose:** Stores the common workflow, ownership, company, anonymity, and moderation state for every contribution.
- **Primary key:** `SUBMISSION_ID`.
- **Important foreign keys:** `USER_ID` references `USERS`; `COMPANY_ID` references `COMPANIES`.
- **Relationships:** It is the parent/supertype for exactly the applicable salary, company-review, or interview subtype and may receive reports and moderation actions.

### `SALARY_SUBMISSIONS`

- **Purpose:** Stores salary-specific details for a salary submission.
- **Primary key:** `SUBMISSION_ID`, also a foreign key to `SUBMISSIONS`.
- **Important foreign keys:** `ROLE_ID` references `JOB_ROLES`.
- **Relationships:** Each row extends one parent submission and classifies it by job role.

### `COMPANY_REVIEWS`

- **Purpose:** Stores ratings and written workplace feedback for a review submission.
- **Primary key:** `SUBMISSION_ID`, also a foreign key to `SUBMISSIONS`.
- **Important foreign keys:** Optional `ROLE_ID` references `JOB_ROLES`.
- **Relationships:** Each row extends one parent submission and may identify the reviewed job role.

### `INTERVIEW_EXPERIENCES`

- **Purpose:** Stores process, difficulty, outcome, and timing details for an interview submission.
- **Primary key:** `SUBMISSION_ID`, also a foreign key to `SUBMISSIONS`.
- **Important foreign keys:** `ROLE_ID` references `JOB_ROLES`.
- **Relationships:** Each row extends one parent submission and classifies the interview by job role.

## 5. Reporting and moderation

### `REPORTS`

- **Purpose:** Stores a user's complaint about a specific contribution and its resolution state.
- **Primary key:** `REPORT_ID`.
- **Important foreign keys:** `REPORTER_USER_ID` and `RESOLVED_BY` reference `USERS`; `SUBMISSION_ID` references `SUBMISSIONS`.
- **Relationships:** A submission may receive many complaints, while one user can report the same submission only once.

### `MODERATION_ACTIONS`

- **Purpose:** Stores the append-only history of admin status changes made to submissions.
- **Primary key:** `ACTION_ID`.
- **Important foreign keys:** `SUBMISSION_ID` references `SUBMISSIONS`; `MODERATOR_USER_ID` references `USERS`.
- **Relationships:** Each row records one moderator's action on one submission.

## Derived views

- `VW_PUBLIC_COMPANIES` exposes company information without private account data.
- `VW_PUBLIC_APPROVED_REVIEWS` exposes only approved review content and never exposes the contributor's account identity.
- `VW_VERIFIED_SALARY_SUMMARY` calculates salary ranges using approved and verified salary contributions.
- `VW_COMMUNITY_SALARY_SUMMARY` calculates salary ranges using all approved salary contributions.

## Recommended explanation order

1. Start with `USERS`.
2. Explain the optional one-to-one `EMPLOYEES` profile.
3. Explain reference tables: `COMPANIES`, `JOB_ROLES` and `BENEFITS`.
4. Explain `EMPLOYMENT_VERIFICATIONS`.
5. Explain `SUBMISSIONS` as the parent/supertype.
6. Explain its three subtype tables.
7. Explain `REPORTS` and `MODERATION_ACTIONS`.
8. Finish with the four derived views.

## Two-minute presentation script

Saple has 14 base tables and 4 views. I begin with `USERS`, which stores login identity and two independent classifications: `USER_TYPE` says whether the account is a normal user or employee, while `ACCOUNT_ROLE` says whether it is a regular user or an admin. Admin is therefore an account role, not a separate table. A user can have at most one optional `EMPLOYEES` profile.

The reference area contains `COMPANIES`, `JOB_ROLES`, and `BENEFITS`. Because one company can offer many benefits and one benefit can belong to many companies, `COMPANY_BENEFITS` resolves that many-to-many relationship. `EMPLOYMENT_VERIFICATIONS` then scopes verification to the exact employee, company, and job role, rather than trusting an employee for every role at a company.

All user contributions begin in `SUBMISSIONS`. This parent table holds the shared owner, company, anonymity, approval, and verification fields. Salary, review, and interview data are separated into three subtype tables. In every subtype, `SUBMISSION_ID` is both the primary key and a foreign key to the parent, so each detail row has exactly one matching workflow row.

For safety and accountability, `REPORTS` stores complaints about contributions, and `MODERATION_ACTIONS` stores the append-only moderation history. Finally, salary summaries and public reviews are derived using views: two salary views distinguish verified and community data, while the public company and approved-review views expose only appropriate information.
