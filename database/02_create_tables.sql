CREATE TABLE
    users (
        user_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR2 (100),
        email VARCHAR2 (150),
        password VARCHAR2 (100),
        user_type VARCHAR2 (20)
    );

CREATE TABLE
    companies (
        company_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_name VARCHAR2 (150),
        industry VARCHAR2 (100),
        location VARCHAR2 (100),
        website VARCHAR2 (200)
    );

CREATE TABLE
    job_roles (
        role_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        role_name VARCHAR2 (100)
    );

CREATE TABLE
    benefits (
        benefit_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        benefit_name VARCHAR2 (100)
    );