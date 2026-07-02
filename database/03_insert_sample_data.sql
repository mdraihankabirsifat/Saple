INSERT INTO
    users (name, email, password, user_type)
VALUES
    ('Rahim', 'rahim@gmail.com', '1234', 'JOB_SEEKER');

INSERT INTO
    companies (company_name, industry, location, website)
VALUES
    (
        'Brain Station 23',
        'Software',
        'Dhaka',
        'brainstation-23.com'
    );

INSERT INTO
    job_roles (role_name)
VALUES
    ('Software Engineer');

INSERT INTO
    benefits (benefit_name)
VALUES
    ('Lunch');

COMMIT;