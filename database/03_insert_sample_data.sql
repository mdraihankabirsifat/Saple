-- Fictional demonstration data for the Saple schema

-- ================================================================
-- Users and employee profiles
-- Password values below are recognizable demonstration hashes only.
-- ================================================================

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (1, 'Nabila Hasan', 'nabila.hasan@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'EMPLOYEE', 'USER', 'ACTIVE', TIMESTAMP '2026-01-05 09:00:00', TIMESTAMP '2026-01-05 09:00:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (2, 'Arif Mahmud', 'arif.mahmud@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'EMPLOYEE', 'USER', 'ACTIVE', TIMESTAMP '2026-01-06 10:15:00', TIMESTAMP '2026-01-06 10:15:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (3, 'Samira Noor', 'samira.noor@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'EMPLOYEE', 'USER', 'ACTIVE', TIMESTAMP '2026-01-07 11:30:00', TIMESTAMP '2026-01-07 11:30:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (4, 'Fahim Rahman', 'fahim.rahman@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'EMPLOYEE', 'USER', 'ACTIVE', TIMESTAMP '2026-01-08 12:00:00', TIMESTAMP '2026-01-08 12:00:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (5, 'Tania Islam', 'tania.islam@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'NORMAL', 'USER', 'ACTIVE', TIMESTAMP '2026-01-09 14:20:00', TIMESTAMP '2026-01-09 14:20:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (6, 'Demo Administrator', 'admin@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'NORMAL', 'ADMIN', 'ACTIVE', TIMESTAMP '2026-01-01 08:00:00', TIMESTAMP '2026-01-01 08:00:00');

INSERT INTO users (user_id, full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
VALUES (7, 'Rafi Ahmed', 'rafi.ahmed@example.test', '$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION', 'NORMAL', 'USER', 'ACTIVE', TIMESTAMP '2026-01-10 15:00:00', TIMESTAMP '2026-01-10 15:00:00');

INSERT INTO employees (employee_id, user_id, employment_status, created_at)
VALUES (1, 1, 'CURRENT', TIMESTAMP '2026-01-05 09:05:00');

INSERT INTO employees (employee_id, user_id, employment_status, created_at)
VALUES (2, 2, 'FORMER', TIMESTAMP '2026-01-06 10:20:00');

INSERT INTO employees (employee_id, user_id, employment_status, created_at)
VALUES (3, 3, 'CURRENT', TIMESTAMP '2026-01-07 11:35:00');

INSERT INTO employees (employee_id, user_id, employment_status, created_at)
VALUES (4, 4, 'FORMER', TIMESTAMP '2026-01-08 12:05:00');

-- ================================================================
-- Companies, roles, benefits, and company-benefit mappings
-- ================================================================

INSERT INTO companies (company_id, company_name, industry, headquarters_city, country, website, company_size, description, created_at, updated_at)
VALUES (1, 'Aster Byte Limited', 'Software', 'Dhaka', 'Bangladesh', 'https://asterbyte.example', '201-500', 'A fictional software product company.', TIMESTAMP '2026-01-02 09:00:00', TIMESTAMP '2026-01-02 09:00:00');

INSERT INTO companies (company_id, company_name, industry, headquarters_city, country, website, company_size, description, created_at, updated_at)
VALUES (2, 'Meghna Analytics', 'Data Analytics', 'Dhaka', 'Bangladesh', 'https://meghna-analytics.example', '51-200', 'A fictional analytics consulting company.', TIMESTAMP '2026-01-02 09:10:00', TIMESTAMP '2026-01-02 09:10:00');

INSERT INTO companies (company_id, company_name, industry, headquarters_city, country, website, company_size, description, created_at, updated_at)
VALUES (3, 'Northstar Fintech', 'Financial Technology', 'Chattogram', 'Bangladesh', 'https://northstar-fintech.example', '501-1000', 'A fictional digital payments provider.', TIMESTAMP '2026-01-02 09:20:00', TIMESTAMP '2026-01-02 09:20:00');

INSERT INTO companies (company_id, company_name, industry, headquarters_city, country, website, company_size, description, created_at, updated_at)
VALUES (4, 'Green Delta Robotics', 'Robotics', 'Gazipur', 'Bangladesh', 'https://green-delta-robotics.example', '11-50', 'A fictional industrial automation startup.', TIMESTAMP '2026-01-02 09:30:00', TIMESTAMP '2026-01-02 09:30:00');

INSERT INTO job_roles (role_id, role_name, role_category, description)
VALUES (1, 'Software Engineer', 'Engineering', 'Builds and maintains software systems.');
INSERT INTO job_roles (role_id, role_name, role_category, description)
VALUES (2, 'Data Analyst', 'Data', 'Analyzes data and prepares business insights.');
INSERT INTO job_roles (role_id, role_name, role_category, description)
VALUES (3, 'Product Designer', 'Design', 'Designs product workflows and interfaces.');
INSERT INTO job_roles (role_id, role_name, role_category, description)
VALUES (4, 'Quality Assurance Engineer', 'Engineering', 'Tests software quality and reliability.');
INSERT INTO job_roles (role_id, role_name, role_category, description)
VALUES (5, 'Graduate Trainee', 'Early Career', 'Rotational entry-level position.');

INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (1, 'Health Insurance', 'Health', 'Employee health coverage.');
INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (2, 'Subsidized Lunch', 'Food', 'Lunch support on working days.');
INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (3, 'Flexible Hours', 'Work Arrangement', 'Flexible start and finish times.');
INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (4, 'Provident Fund', 'Financial', 'Employer-supported retirement savings.');
INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (5, 'Training Budget', 'Learning', 'Annual professional development allowance.');
INSERT INTO benefits (benefit_id, benefit_name, benefit_category, description)
VALUES (6, 'Remote Work', 'Work Arrangement', 'Eligible roles may work remotely.');

INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (1, 1, 'Standard employee plan.', 'Full-time employees after probation.', TIMESTAMP '2026-02-01 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (1, 2, 'Partially subsidized weekday lunch.', 'All on-site employees.', TIMESTAMP '2026-02-01 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (1, 6, 'Two remote days per week.', 'Role and manager approval required.', TIMESTAMP '2026-02-01 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (2, 3, 'Flexible arrival window.', 'All permanent employees.', TIMESTAMP '2026-02-02 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (2, 5, 'Annual course allowance.', 'After six months of service.', TIMESTAMP '2026-02-02 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (3, 1, 'Employee and dependent coverage.', 'Confirmed employees.', TIMESTAMP '2026-02-03 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (3, 4, 'Matched monthly contribution.', 'Permanent employees.', TIMESTAMP '2026-02-03 10:00:00');
INSERT INTO company_benefits (company_id, benefit_id, details, eligibility, last_updated)
VALUES (4, 5, 'Technical certification support.', 'All employees with approval.', TIMESTAMP '2026-02-04 10:00:00');

-- ================================================================
-- Company-specific employment verification examples
-- No OTP, document content, or confidential identifier is stored.
-- ================================================================

INSERT INTO employment_verifications (verification_id, employee_id, company_id, verification_method, company_email, proof_type, proof_reference, verification_status, requested_at, reviewed_at, expires_at, rejection_reason, reviewed_by)
VALUES (1, 1, 1, 'COMPANY_EMAIL_OTP', 'nabila@asterbyte.example', NULL, NULL, 'VERIFIED', TIMESTAMP '2026-02-05 09:00:00', TIMESTAMP '2026-02-05 09:20:00', TIMESTAMP '2027-02-05 09:20:00', NULL, 6);

INSERT INTO employment_verifications (verification_id, employee_id, company_id, verification_method, company_email, proof_type, proof_reference, verification_status, requested_at, reviewed_at, expires_at, rejection_reason, reviewed_by)
VALUES (2, 2, 2, 'DOCUMENT', NULL, 'EXPERIENCE_CERTIFICATE', 'demo://proof/verification-0002', 'VERIFIED', TIMESTAMP '2026-02-06 10:00:00', TIMESTAMP '2026-02-07 11:00:00', TIMESTAMP '2027-02-07 11:00:00', NULL, 6);

INSERT INTO employment_verifications (verification_id, employee_id, company_id, verification_method, company_email, proof_type, proof_reference, verification_status, requested_at, reviewed_at, expires_at, rejection_reason, reviewed_by)
VALUES (3, 3, 3, 'COMPANY_EMAIL_OTP', 'samira@northstar-fintech.example', NULL, NULL, 'PENDING', TIMESTAMP '2026-02-08 12:00:00', NULL, NULL, NULL, NULL);

INSERT INTO employment_verifications (verification_id, employee_id, company_id, verification_method, company_email, proof_type, proof_reference, verification_status, requested_at, reviewed_at, expires_at, rejection_reason, reviewed_by)
VALUES (4, 4, 4, 'DOCUMENT', NULL, 'RELEASE_LETTER', 'demo://proof/verification-0004', 'REJECTED', TIMESTAMP '2026-02-09 13:00:00', TIMESTAMP '2026-02-10 15:00:00', NULL, 'The fictional reference could not be validated.', 6);

-- ================================================================
-- Submission parent rows
-- ================================================================

INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (1, 1, 1, 'SALARY', 1, 'APPROVED', 'VERIFIED', TIMESTAMP '2026-03-01 09:00:00', TIMESTAMP '2026-03-02 10:00:00', TIMESTAMP '2026-03-02 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (2, 5, 1, 'SALARY', 1, 'APPROVED', 'UNVERIFIED', TIMESTAMP '2026-03-03 09:00:00', TIMESTAMP '2026-03-04 10:00:00', TIMESTAMP '2026-03-04 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (3, 2, 2, 'SALARY', 1, 'APPROVED', 'VERIFIED', TIMESTAMP '2026-03-05 09:00:00', TIMESTAMP '2026-03-06 10:00:00', TIMESTAMP '2026-03-06 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (4, 3, 3, 'SALARY', 1, 'PENDING', 'PENDING', TIMESTAMP '2026-03-07 09:00:00', NULL, TIMESTAMP '2026-03-07 09:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (5, 1, 1, 'REVIEW', 1, 'APPROVED', 'VERIFIED', TIMESTAMP '2026-03-08 09:00:00', TIMESTAMP '2026-03-09 10:00:00', TIMESTAMP '2026-03-09 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (6, 2, 2, 'REVIEW', 1, 'APPROVED', 'VERIFIED', TIMESTAMP '2026-03-10 09:00:00', TIMESTAMP '2026-03-11 10:00:00', TIMESTAMP '2026-03-11 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (7, 7, 3, 'REVIEW', 1, 'PENDING', 'UNVERIFIED', TIMESTAMP '2026-03-12 09:00:00', NULL, TIMESTAMP '2026-03-12 09:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (8, 5, 1, 'INTERVIEW', 1, 'APPROVED', 'UNVERIFIED', TIMESTAMP '2026-03-13 09:00:00', TIMESTAMP '2026-03-14 10:00:00', TIMESTAMP '2026-03-14 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (9, 7, 4, 'INTERVIEW', 1, 'APPROVED', 'UNVERIFIED', TIMESTAMP '2026-03-15 09:00:00', TIMESTAMP '2026-03-16 10:00:00', TIMESTAMP '2026-03-16 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (10, 4, 4, 'INTERVIEW', 1, 'FLAGGED', 'REJECTED', TIMESTAMP '2026-03-17 09:00:00', NULL, TIMESTAMP '2026-03-18 10:00:00');
INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous, submission_status, verification_status, submitted_at, approved_at, updated_at)
VALUES (11, 1, 1, 'SALARY', 1, 'APPROVED', 'VERIFIED', TIMESTAMP '2026-03-18 09:00:00', TIMESTAMP '2026-03-19 10:00:00', TIMESTAMP '2026-03-19 10:00:00');

-- ================================================================
-- Salary, review, and interview subtype rows
-- ================================================================

INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency, pay_period, years_of_experience, employment_type, work_mode, salary_year)
VALUES (1, 1, 85000, 10000, 'BDT', 'MONTHLY', 3.0, 'FULL_TIME', 'HYBRID', 2026);
INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency, pay_period, years_of_experience, employment_type, work_mode, salary_year)
VALUES (2, 1, 72000, 5000, 'BDT', 'MONTHLY', 2.0, 'FULL_TIME', 'ONSITE', 2026);
INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency, pay_period, years_of_experience, employment_type, work_mode, salary_year)
VALUES (3, 2, 900000, 75000, 'BDT', 'YEARLY', 4.5, 'FULL_TIME', 'HYBRID', 2026);
INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency, pay_period, years_of_experience, employment_type, work_mode, salary_year)
VALUES (4, 1, 95000, NULL, 'BDT', 'MONTHLY', 5.0, 'FULL_TIME', 'ONSITE', 2026);
INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency, pay_period, years_of_experience, employment_type, work_mode, salary_year)
VALUES (11, 1, 92000, 12000, 'BDT', 'MONTHLY', 4.0, 'FULL_TIME', 'REMOTE', 2026);

INSERT INTO company_reviews (submission_id, role_id, review_title, overall_rating, work_life_balance_rating, career_growth_rating, management_rating, culture_rating, pros, cons, advice_to_management, employment_status, review_date)
VALUES (5, 1, 'Supportive engineering team', 4.5, 4.0, 4.5, 4.0, 4.5, 'Helpful teammates and useful code reviews.', 'Release weeks can be busy.', 'Plan release capacity earlier.', 'CURRENT', DATE '2026-03-08');
INSERT INTO company_reviews (submission_id, role_id, review_title, overall_rating, work_life_balance_rating, career_growth_rating, management_rating, culture_rating, pros, cons, advice_to_management, employment_status, review_date)
VALUES (6, 2, 'Strong learning opportunities', 4.0, 3.5, 4.5, 3.5, 4.0, 'Varied projects and good mentoring.', 'Some project timelines were tight.', 'Keep staffing aligned with project scope.', 'FORMER', DATE '2026-03-10');
INSERT INTO company_reviews (submission_id, role_id, review_title, overall_rating, work_life_balance_rating, career_growth_rating, management_rating, culture_rating, pros, cons, advice_to_management, employment_status, review_date)
VALUES (7, NULL, 'Interesting product domain', 3.5, 3.0, 4.0, 3.0, 3.5, 'Exposure to payment systems.', 'Documentation needs improvement.', NULL, 'FORMER', DATE '2026-03-12');

INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count, interview_mode, result_status, duration_days, process_description, questions_summary)
VALUES (8, 5, DATE '2026-02-20', 'MEDIUM', 3, 'ONLINE', 'OFFERED', 10, 'An aptitude test was followed by technical and HR interviews.', 'Basic SQL joins, problem solving, and teamwork scenarios.');
INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count, interview_mode, result_status, duration_days, process_description, questions_summary)
VALUES (9, 1, DATE '2026-02-25', 'HARD', 4, 'HYBRID', 'REJECTED', 18, 'The process included coding, system design, and two discussions.', 'Algorithms, API design, and debugging questions.');
INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count, interview_mode, result_status, duration_days, process_description, questions_summary)
VALUES (10, 4, DATE '2026-03-01', 'EASY', 2, 'ONSITE', 'PENDING', 3, 'A written test and one technical conversation were held.', 'Test-case design and basic database checks.');

-- ================================================================
-- Reports and immutable moderation audit examples
-- ================================================================

INSERT INTO reports (report_id, reporter_user_id, submission_id, reason_category, report_description, report_status, reported_at, resolved_at, resolution_note, resolved_by)
VALUES (1, 5, 10, 'FAKE_DATA', 'The timeline appears inconsistent.', 'OPEN', TIMESTAMP '2026-03-18 08:00:00', NULL, NULL, NULL);
INSERT INTO reports (report_id, reporter_user_id, submission_id, reason_category, report_description, report_status, reported_at, resolved_at, resolution_note, resolved_by)
VALUES (2, 7, 5, 'SPAM', 'Submitted for moderator review as a demonstration.', 'DISMISSED', TIMESTAMP '2026-03-19 08:00:00', TIMESTAMP '2026-03-19 12:00:00', 'The approved review was relevant and non-duplicative.', 6);

INSERT INTO moderation_actions (action_id, submission_id, moderator_user_id, action_type, previous_status, new_status, action_note, action_at)
VALUES (1, 1, 6, 'APPROVE', 'PENDING', 'APPROVED', 'Salary evidence and content checks completed.', TIMESTAMP '2026-03-02 10:00:00');
INSERT INTO moderation_actions (action_id, submission_id, moderator_user_id, action_type, previous_status, new_status, action_note, action_at)
VALUES (2, 5, 6, 'APPROVE', 'PENDING', 'APPROVED', 'Review met publication guidelines.', TIMESTAMP '2026-03-09 10:00:00');
INSERT INTO moderation_actions (action_id, submission_id, moderator_user_id, action_type, previous_status, new_status, action_note, action_at)
VALUES (3, 10, 6, 'FLAG', 'PENDING', 'FLAGGED', 'Held for manual verification of the reported timeline.', TIMESTAMP '2026-03-18 10:00:00');

COMMIT;

-- Keep identity generators above the explicit demonstration IDs inserted above.
-- START WITH LIMIT VALUE sets each generator to the current table high-water mark.
ALTER TABLE users MODIFY (
    user_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE employees MODIFY (
    employee_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE companies MODIFY (
    company_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE job_roles MODIFY (
    role_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE benefits MODIFY (
    benefit_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE employment_verifications MODIFY (
    verification_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE submissions MODIFY (
    submission_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE reports MODIFY (
    report_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);

ALTER TABLE moderation_actions MODIFY (
    action_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE)
);
