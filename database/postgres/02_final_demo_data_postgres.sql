-- SAPLE SUPABASE POSTGRESQL DEMONSTRATION DATA
-- Run only after 01_final_schema_postgres.sql in a fresh Supabase project.

BEGIN;

-- FINAL CONSOLIDATED SAPLE DEMONSTRATION DATA.
-- Run only after 01_final_schema.sql in a completely fresh database.
-- Do not execute again on the existing populated SAPLE schema.

-- The sections below preserve the original data-loading execution order.
-- ================================================================
-- SECTION 1: BASE SAMPLE DATA
-- ================================================================

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

-- Synchronize identities before inserts that rely on generated IDs.
SELECT setval(pg_get_serial_sequence('users', 'user_id'),
  COALESCE((SELECT MAX(user_id) FROM users), 1),
  EXISTS (SELECT 1 FROM users));

SELECT setval(pg_get_serial_sequence('employees', 'employee_id'),
  COALESCE((SELECT MAX(employee_id) FROM employees), 1),
  EXISTS (SELECT 1 FROM employees));

SELECT setval(pg_get_serial_sequence('companies', 'company_id'),
  COALESCE((SELECT MAX(company_id) FROM companies), 1),
  EXISTS (SELECT 1 FROM companies));

SELECT setval(pg_get_serial_sequence('job_roles', 'role_id'),
  COALESCE((SELECT MAX(role_id) FROM job_roles), 1),
  EXISTS (SELECT 1 FROM job_roles));

SELECT setval(pg_get_serial_sequence('benefits', 'benefit_id'),
  COALESCE((SELECT MAX(benefit_id) FROM benefits), 1),
  EXISTS (SELECT 1 FROM benefits));

SELECT setval(pg_get_serial_sequence('employment_verifications', 'verification_id'),
  COALESCE((SELECT MAX(verification_id) FROM employment_verifications), 1),
  EXISTS (SELECT 1 FROM employment_verifications));

SELECT setval(pg_get_serial_sequence('submissions', 'submission_id'),
  COALESCE((SELECT MAX(submission_id) FROM submissions), 1),
  EXISTS (SELECT 1 FROM submissions));

SELECT setval(pg_get_serial_sequence('reports', 'report_id'),
  COALESCE((SELECT MAX(report_id) FROM reports), 1),
  EXISTS (SELECT 1 FROM reports));

SELECT setval(pg_get_serial_sequence('moderation_actions', 'action_id'),
  COALESCE((SELECT MAX(action_id) FROM moderation_actions), 1),
  EXISTS (SELECT 1 FROM moderation_actions));

SELECT setval(pg_get_serial_sequence('password_reset_tokens', 'reset_token_id'),
  COALESCE((SELECT MAX(reset_token_id) FROM password_reset_tokens), 1),
  EXISTS (SELECT 1 FROM password_reset_tokens));

-- ================================================================
-- SECTION 2: REFERENCE DATA EXPANSION
-- ================================================================

INSERT INTO companies (
  company_name, industry, headquarters_city, country, website, company_size, description
) VALUES
  ('Grameenphone', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.grameenphone.com', NULL, 'A Bangladesh telecommunications and digital services provider.'),
  ('Robi Axiata', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.robi.com.bd', NULL, 'A mobile network and digital services provider in Bangladesh.'),
  ('Banglalink', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.banglalink.net', NULL, 'A digital communications service provider in Bangladesh.'),
  ('BRAC Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.bracbank.com', NULL, 'A private commercial bank with a focus that includes small and medium enterprises.'),
  ('City Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.citybankplc.com', NULL, 'A private commercial bank serving retail, business, and corporate customers.'),
  ('Eastern Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.ebl.com.bd', NULL, 'A private commercial bank providing consumer, SME, and corporate financial services.'),
  ('Dutch-Bangla Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.dutchbanglabank.com', NULL, 'A private commercial bank known for banking and electronic payment services.'),
  ('IDLC Finance', 'Financial Services', 'Dhaka', 'Bangladesh', 'https://idlc.com', NULL, 'A non-bank financial institution serving consumer, SME, and corporate clients.'),
  ('bKash', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://www.bkash.com', NULL, 'A mobile financial services provider operating in Bangladesh.'),
  ('Nagad', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://nagad.com.bd', NULL, 'A mobile financial service offering digital payments and money transfer services.'),
  ('Square Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://squarepharma.com.bd', NULL, 'A Bangladesh pharmaceutical manufacturer and healthcare company.'),
  ('Renata', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.renata-limited.com', NULL, 'A pharmaceutical and animal-health products manufacturer.'),
  ('Incepta Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.inceptapharma.com', NULL, 'A Bangladesh manufacturer of pharmaceutical products.'),
  ('Beximco Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.beximcopharma.com', NULL, 'A pharmaceutical manufacturer serving domestic and international markets.'),
  ('ACI', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.aci-bd.com', NULL, 'A Bangladesh group active in pharmaceuticals, consumer brands, agribusiness, and retail.'),
  ('PRAN-RFL Group', 'Consumer Goods', 'Dhaka', 'Bangladesh', 'https://www.pranrflgroup.com', NULL, 'A Bangladesh group producing food, beverages, plastics, and household products.'),
  ('Walton Hi-Tech Industries', 'Electronics Manufacturing', 'Gazipur', 'Bangladesh', 'https://waltonbd.com', '10000+', 'A Bangladesh manufacturer of electronics, electrical appliances, and technology products.'),
  ('Bashundhara Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.bashundharagroup.com', NULL, 'A Bangladesh group with businesses spanning manufacturing, property, media, and services.'),
  ('Akij Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://akij.net', NULL, 'A Bangladesh industrial group with operations across consumer and manufacturing sectors.'),
  ('Meghna Group of Industries', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.mgi.org', '10000+', 'A Bangladesh conglomerate active in consumer goods, materials, logistics, and industrial manufacturing.'),
  ('Beximco Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.beximco.com', NULL, 'A Bangladesh business group with operations in manufacturing and services.'),
  ('DBL Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://dbl-group.com', NULL, 'A diversified Bangladesh group with a foundation in apparel and textiles.'),
  ('Viyellatex Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://www.viyellatexgroup.com', '10000+', 'An integrated apparel and textile group based in Bangladesh.'),
  ('Brain Station 23', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://brainstation-23.com', NULL, 'A Bangladesh software development and digital transformation company.'),
  ('BJIT', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://bjitgroup.com', '501-1000', 'A software development and IT services company with Bangladesh operations.'),
  ('Enosis Solutions', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.enosisbd.com', NULL, 'A Bangladesh software engineering and quality assurance services company.'),
  ('Therap (Bangladesh)', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://therapbd.com', NULL, 'A Bangladesh software development operation building human-services applications.'),
  ('SSL Wireless', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://sslwireless.com', '201-500', 'A Bangladesh digital payments and technology infrastructure company.'),
  ('Pathao', 'Consumer Technology', 'Dhaka', 'Bangladesh', 'https://pathao.com', NULL, 'A Bangladesh consumer technology platform for mobility, delivery, logistics, and payments.'),
  ('Chaldal', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://chaldal.com', NULL, 'A Bangladesh online grocery and household essentials platform.'),
  ('ShopUp', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://shopup.org', NULL, 'A Bangladesh B2B commerce platform connecting manufacturers and neighborhood retailers.'),
  ('Daraz Bangladesh', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://www.daraz.com.bd', NULL, 'The Bangladesh operation of a South Asian online marketplace.'),
  ('foodpanda Bangladesh', 'Consumer Technology', 'Dhaka', 'Bangladesh', 'https://www.foodpanda.com.bd', NULL, 'The Bangladesh operation of an online food and commerce delivery platform.'),
  ('BRAC', 'Nonprofit and Development', 'Dhaka', 'Bangladesh', 'https://www.brac.net', NULL, 'A Bangladesh-founded international development organization.'),
  ('Summit Group', 'Power and Infrastructure', 'Dhaka', 'Bangladesh', 'https://summitpowerinternational.com', NULL, 'A Bangladesh-origin infrastructure group focused on power generation and related services.'),
  ('Google', 'Technology', 'Mountain View', 'United States', 'https://about.google', NULL, 'A global technology company building internet, cloud, advertising, and computing products.'),
  ('Microsoft', 'Technology', 'Redmond', 'United States', 'https://www.microsoft.com', NULL, 'A global software, cloud, productivity, and computing company.'),
  ('Amazon', 'Technology and Retail', 'Seattle', 'United States', 'https://www.aboutamazon.com', NULL, 'A global company operating e-commerce, cloud computing, logistics, and digital services.'),
  ('IBM', 'Technology and Consulting', 'Armonk', 'United States', 'https://www.ibm.com', NULL, 'A global technology and consulting company.'),
  ('Oracle', 'Technology', 'Austin', 'United States', 'https://www.oracle.com', NULL, 'A global database, enterprise software, and cloud technology company.'),
  ('Samsung Electronics', 'Electronics Manufacturing', 'Suwon', 'South Korea', 'https://www.samsung.com', NULL, 'A global electronics and technology manufacturer.'),
  ('Unilever', 'Consumer Goods', 'London', 'United Kingdom', 'https://www.unilever.com', NULL, 'A global consumer goods company.'),
  ('Nestle', 'Food and Beverage', 'Vevey', 'Switzerland', 'https://www.nestle.com', NULL, 'A global food and beverage company.'),
  ('Siemens', 'Industrial Technology', 'Munich', 'Germany', 'https://www.siemens.com', NULL, 'A global industrial technology and infrastructure company.'),
  ('Deloitte', 'Professional Services', 'London', 'United Kingdom', 'https://www.deloitte.com', NULL, 'A global professional services organization.'),
  ('PwC', 'Professional Services', 'London', 'United Kingdom', 'https://www.pwc.com', NULL, 'A global assurance, tax, and consulting network.'),
  ('Maersk', 'Logistics and Shipping', 'Copenhagen', 'Denmark', 'https://www.maersk.com', NULL, 'A global logistics and shipping company.'),
  ('Toyota', 'Automotive Manufacturing', 'Toyota City', 'Japan', 'https://global.toyota', NULL, 'A global automotive and mobility manufacturer.'),
  ('Pfizer', 'Pharmaceuticals', 'New York', 'United States', 'https://www.pfizer.com', NULL, 'A global biopharmaceutical company.'),
  ('HSBC', 'Banking', 'London', 'United Kingdom', 'https://www.hsbc.com', NULL, 'A global banking and financial services organization.')
ON CONFLICT (company_name) DO NOTHING;

INSERT INTO job_roles (role_name, role_category, description) VALUES
  ('Backend Engineer', 'Technology', 'Builds server-side applications, APIs, and services.'),
  ('Frontend Engineer', 'Technology', 'Builds accessible web interfaces and client-side applications.'),
  ('Full Stack Engineer', 'Technology', 'Works across client, server, and data layers.'),
  ('Mobile Application Developer', 'Technology', 'Builds and maintains mobile applications.'),
  ('DevOps Engineer', 'Technology', 'Automates delivery pipelines and infrastructure operations.'),
  ('Cloud Engineer', 'Technology', 'Designs and operates cloud platforms and services.'),
  ('Site Reliability Engineer', 'Technology', 'Improves production reliability, observability, and performance.'),
  ('Cybersecurity Analyst', 'Technology', 'Monitors and reduces information security risk.'),
  ('Database Administrator', 'Technology', 'Operates, secures, and tunes database systems.'),
  ('Systems Administrator', 'Technology', 'Maintains computing systems and core services.'),
  ('Network Engineer', 'Technology', 'Designs and supports network infrastructure.'),
  ('Data Engineer', 'Data and Analytics', 'Builds reliable data platforms and pipelines.'),
  ('Data Scientist', 'Data and Analytics', 'Uses statistics and computation to develop data products and insights.'),
  ('Machine Learning Engineer', 'Data and Analytics', 'Builds and operates production machine learning systems.'),
  ('Business Intelligence Analyst', 'Data and Analytics', 'Develops reporting models and decision-support dashboards.'),
  ('Product Manager', 'Product and Design', 'Guides product strategy, priorities, and delivery.'),
  ('Project Manager', 'Business and Operations', 'Plans and coordinates projects, schedules, and stakeholders.'),
  ('Business Analyst', 'Business and Operations', 'Translates business needs into processes and requirements.'),
  ('UI/UX Designer', 'Product and Design', 'Researches and designs user interfaces and experiences.'),
  ('Graphic Designer', 'Product and Design', 'Creates visual communication and brand assets.'),
  ('Technical Writer', 'Product and Design', 'Creates clear product and technical documentation.'),
  ('Customer Success Manager', 'Customer and Support', 'Helps customers adopt products and achieve outcomes.'),
  ('Customer Support Specialist', 'Customer and Support', 'Resolves customer questions and service issues.'),
  ('Human Resources Officer', 'People and Administration', 'Supports employee programs and workplace policy.'),
  ('Talent Acquisition Specialist', 'People and Administration', 'Sources and recruits candidates for open roles.'),
  ('Operations Manager', 'Business and Operations', 'Plans and improves day-to-day business operations.'),
  ('Supply Chain Analyst', 'Supply Chain', 'Analyzes inventory, planning, and supply flow.'),
  ('Procurement Officer', 'Supply Chain', 'Sources goods and services and manages suppliers.'),
  ('Logistics Coordinator', 'Supply Chain', 'Coordinates transport, warehousing, and delivery.'),
  ('Accountant', 'Finance and Banking', 'Maintains accounts and prepares financial records.'),
  ('Financial Analyst', 'Finance and Banking', 'Evaluates financial performance and business decisions.'),
  ('Internal Auditor', 'Finance and Banking', 'Assesses controls, records, and operational compliance.'),
  ('Risk Analyst', 'Finance and Banking', 'Identifies, measures, and monitors business risk.'),
  ('Compliance Officer', 'Finance and Banking', 'Supports regulatory and policy compliance.'),
  ('Banking Officer', 'Finance and Banking', 'Provides banking operations and customer services.'),
  ('Sales Executive', 'Sales and Marketing', 'Develops customer relationships and sales opportunities.'),
  ('Marketing Executive', 'Sales and Marketing', 'Plans and delivers marketing activities.'),
  ('Digital Marketing Specialist', 'Sales and Marketing', 'Runs digital acquisition and engagement campaigns.'),
  ('Brand Manager', 'Sales and Marketing', 'Guides brand positioning and market programs.'),
  ('Medical Promotion Officer', 'Pharmaceuticals and Science', 'Communicates pharmaceutical product information to healthcare professionals.'),
  ('Pharmacist', 'Pharmaceuticals and Science', 'Supports safe preparation and use of medicines.'),
  ('Chemist', 'Pharmaceuticals and Science', 'Performs chemical research, analysis, and quality work.'),
  ('Laboratory Technologist', 'Pharmaceuticals and Science', 'Performs laboratory testing and maintains technical records.'),
  ('Production Engineer', 'Engineering and Manufacturing', 'Improves manufacturing processes and production performance.'),
  ('Industrial Engineer', 'Engineering and Manufacturing', 'Optimizes production systems, quality, and efficiency.'),
  ('Mechanical Engineer', 'Engineering and Manufacturing', 'Designs and maintains mechanical systems.'),
  ('Electrical Engineer', 'Engineering and Manufacturing', 'Designs and maintains electrical systems.'),
  ('Civil Engineer', 'Engineering and Construction', 'Designs and supervises civil infrastructure work.'),
  ('Architect', 'Engineering and Construction', 'Plans buildings and coordinates architectural design.'),
  ('Textile Engineer', 'Apparel and Textiles', 'Develops and improves textile production processes.'),
  ('Apparel Merchandiser', 'Apparel and Textiles', 'Coordinates apparel orders, costing, materials, and delivery.'),
  ('Agronomist', 'Agriculture', 'Applies crop and soil science to agricultural production.'),
  ('Teacher', 'Education and Research', 'Plans and delivers learning activities.'),
  ('Research Associate', 'Education and Research', 'Supports structured academic or commercial research.'),
  ('Management Trainee', 'Early Career', 'Completes a structured rotation across business functions.')
ON CONFLICT (role_name) DO NOTHING;

-- ================================================================
-- SECTION 3: DETERMINISTIC SYNTHETIC SALARY AND REVIEW DEMO DATA
-- ================================================================
-- These fictional academic records must never be treated as production claims
-- or as trustworthy ML training data.

INSERT INTO users (
  full_name, email, password_hash, user_type, account_role, account_status
) VALUES (
  'Synthetic Demo Moderator',
  'saple.demo.moderator@example.invalid',
  '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
  'NORMAL', 'ADMIN', 'ACTIVE'
)
ON CONFLICT (email) DO NOTHING;

DO $saple_seed$
DECLARE
  scope_row RECORD;
  salary_number INTEGER;
  review_number INTEGER;
  v_demo_admin_id BIGINT;
  v_user_id BIGINT;
  v_employee_id BIGINT;
  v_submission_id BIGINT;
  v_base_salary NUMERIC(12,2);
  v_salary NUMERIC(12,2);
  v_email VARCHAR(254);
  v_company_email VARCHAR(254);
  v_title VARCHAR(200);
BEGIN
  SELECT user_id INTO STRICT v_demo_admin_id
  FROM users
  WHERE LOWER(email) = 'saple.demo.moderator@example.invalid';

  FOR scope_row IN
    WITH seeded_names(company_name) AS (
      VALUES
        ('Aster Byte Limited'),
        ('Meghna Analytics'),
        ('Northstar Fintech'),
        ('Green Delta Robotics'),
        ('Grameenphone'),
        ('Robi Axiata'),
        ('Banglalink'),
        ('BRAC Bank'),
        ('City Bank'),
        ('Eastern Bank'),
        ('Dutch-Bangla Bank'),
        ('IDLC Finance'),
        ('bKash'),
        ('Nagad'),
        ('Square Pharmaceuticals'),
        ('Renata'),
        ('Incepta Pharmaceuticals'),
        ('Beximco Pharmaceuticals'),
        ('ACI'),
        ('PRAN-RFL Group'),
        ('Walton Hi-Tech Industries'),
        ('Bashundhara Group'),
        ('Akij Group'),
        ('Meghna Group of Industries'),
        ('Beximco Group'),
        ('DBL Group'),
        ('Viyellatex Group'),
        ('Brain Station 23'),
        ('BJIT'),
        ('Enosis Solutions'),
        ('Therap (Bangladesh)'),
        ('SSL Wireless'),
        ('Pathao'),
        ('Chaldal'),
        ('ShopUp'),
        ('Daraz Bangladesh'),
        ('foodpanda Bangladesh'),
        ('BRAC'),
        ('Summit Group'),
        ('Google'),
        ('Microsoft'),
        ('Amazon'),
        ('IBM'),
        ('Oracle'),
        ('Samsung Electronics'),
        ('Unilever'),
        ('Nestle'),
        ('Siemens'),
        ('Deloitte'),
        ('PwC'),
        ('Maersk'),
        ('Toyota'),
        ('Pfizer'),
        ('HSBC')
    ),
    company_roles AS (
      SELECT c.company_id, c.company_name, c.industry,
        CASE
          WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Pharmacist'
          WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%'
            THEN 'Textile Engineer'
          WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES'
            THEN 'Banking Officer'
          WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Data Engineer'
          WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
            OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
            OR UPPER(c.industry) LIKE '%POWER%' THEN 'Production Engineer'
          WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
            OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Operations Manager'
          WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Project Manager'
          WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%'
            THEN 'Business Analyst'
          WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%'
            THEN 'Logistics Coordinator'
          ELSE 'Backend Engineer'
        END AS primary_role,
        CASE
          WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Medical Promotion Officer'
          WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%'
            THEN 'Apparel Merchandiser'
          WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES'
            THEN 'Risk Analyst'
          WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Business Intelligence Analyst'
          WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
            OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
            OR UPPER(c.industry) LIKE '%POWER%' THEN 'Electrical Engineer'
          WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
            OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Supply Chain Analyst'
          WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Research Associate'
          WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%'
            THEN 'Internal Auditor'
          WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%'
            THEN 'Supply Chain Analyst'
          ELSE 'Data Engineer'
        END AS secondary_role
      FROM companies c
      JOIN seeded_names n ON UPPER(n.company_name) = UPPER(c.company_name)
    ),
    scope_names AS (
      SELECT company_id, company_name, industry, primary_role AS role_name, 1 AS scope_order
      FROM company_roles
      UNION ALL
      SELECT company_id, company_name, industry, secondary_role, 2
      FROM company_roles
    )
    SELECT s.company_id, s.company_name, s.industry, s.scope_order,
      jr.role_id, jr.role_name, jr.role_category
    FROM scope_names s
    JOIN job_roles jr ON UPPER(jr.role_name) = UPPER(s.role_name)
    ORDER BY s.company_id, s.scope_order
  LOOP
    v_email := 'saple.demo.c' || scope_row.company_id || '.r'
      || scope_row.role_id || '@example.invalid';
    v_company_email := 'saple.demo.c' || scope_row.company_id || '.r'
      || scope_row.role_id || '@verification.invalid';

    INSERT INTO users (
      full_name, email, password_hash, user_type, account_role, account_status
    ) VALUES (
      'Synthetic Demo Employee C' || scope_row.company_id || ' R' || scope_row.role_id,
      v_email,
      '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
      'EMPLOYEE', 'USER', 'ACTIVE'
    )
    ON CONFLICT (email) DO NOTHING;

    SELECT user_id INTO STRICT v_user_id FROM users WHERE LOWER(email) = LOWER(v_email);

    INSERT INTO employees (user_id, employment_status)
    VALUES (v_user_id, 'CURRENT')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT employee_id INTO STRICT v_employee_id FROM employees WHERE user_id = v_user_id;

    INSERT INTO employment_verifications (
      employee_id, company_id, role_id, verification_method, company_email,
      proof_type, proof_reference, verification_status, requested_at,
      reviewed_at, expires_at, rejection_reason, reviewed_by
    )
    SELECT v_employee_id, scope_row.company_id, scope_row.role_id,
      'COMPANY_EMAIL_OTP', v_company_email, NULL, NULL, 'VERIFIED',
      TIMESTAMPTZ '2026-05-01 09:00:00+06', TIMESTAMPTZ '2026-05-01 10:00:00+06',
      TIMESTAMPTZ '2035-05-01 10:00:00+06', NULL, v_demo_admin_id
    WHERE NOT EXISTS (
      SELECT 1 FROM employment_verifications ev
      WHERE ev.employee_id = v_employee_id
        AND ev.company_id = scope_row.company_id
        AND ev.role_id = scope_row.role_id
        AND ev.company_email = v_company_email
    );

    v_base_salary := CASE
      WHEN UPPER(scope_row.role_category) LIKE '%TECH%'
        OR UPPER(scope_row.role_category) LIKE '%DATA%'
        OR UPPER(scope_row.role_category) LIKE '%ENGINEER%' THEN 65000
      WHEN UPPER(scope_row.role_category) LIKE '%FINANCE%'
        OR UPPER(scope_row.role_category) LIKE '%BANK%' THEN 58000
      WHEN UPPER(scope_row.role_category) LIKE '%PHARM%' THEN 50000
      WHEN UPPER(scope_row.role_category) LIKE '%SUPPLY%'
        OR UPPER(scope_row.role_category) LIKE '%MANUFACTUR%' THEN 48000
      ELSE 52000
    END;

    FOR salary_number IN 1..5 LOOP
      v_salary := v_base_salary + (3500 * salary_number);
      IF NOT EXISTS (
        SELECT 1 FROM submissions s
        JOIN salary_submissions ss ON ss.submission_id = s.submission_id
        WHERE s.user_id = v_user_id AND s.company_id = scope_row.company_id
          AND s.submission_type = 'SALARY' AND ss.role_id = scope_row.role_id
          AND ss.salary_year = 2026 AND ss.years_of_experience = salary_number
          AND ss.base_salary = v_salary
      ) THEN
        INSERT INTO submissions (
          user_id, company_id, submission_type, is_anonymous,
          submission_status, verification_status, submitted_at, approved_at, updated_at
        ) VALUES (
          v_user_id, scope_row.company_id, 'SALARY', 1, 'APPROVED', 'VERIFIED',
          TIMESTAMPTZ '2026-06-01 09:00:00+06'
            + ((MOD(scope_row.company_id, 20) + salary_number) * INTERVAL '1 day'),
          TIMESTAMPTZ '2026-06-02 09:00:00+06'
            + ((MOD(scope_row.company_id, 20) + salary_number) * INTERVAL '1 day'),
          TIMESTAMPTZ '2026-06-02 09:00:00+06'
            + ((MOD(scope_row.company_id, 20) + salary_number) * INTERVAL '1 day')
        ) RETURNING submission_id INTO v_submission_id;

        INSERT INTO salary_submissions (
          submission_id, role_id, base_salary, additional_compensation, currency,
          pay_period, years_of_experience, employment_type, work_mode, salary_year
        ) VALUES (
          v_submission_id, scope_row.role_id, v_salary,
          3000 + (salary_number * 1000), 'BDT', 'MONTHLY', salary_number,
          'FULL_TIME',
          CASE MOD(salary_number, 3)
            WHEN 0 THEN 'REMOTE' WHEN 1 THEN 'ONSITE' ELSE 'HYBRID'
          END,
          2026
        );
      END IF;
    END LOOP;

    IF scope_row.scope_order = 1 THEN
      FOR review_number IN 1..3 LOOP
        v_title := 'Synthetic academic demo review ' || review_number;
        IF NOT EXISTS (
          SELECT 1 FROM submissions s
          JOIN company_reviews cr ON cr.submission_id = s.submission_id
          WHERE s.user_id = v_user_id AND s.company_id = scope_row.company_id
            AND s.submission_type = 'REVIEW' AND cr.role_id = scope_row.role_id
            AND cr.review_title = v_title
        ) THEN
          INSERT INTO submissions (
            user_id, company_id, submission_type, is_anonymous,
            submission_status, verification_status, submitted_at, approved_at, updated_at
          ) VALUES (
            v_user_id, scope_row.company_id, 'REVIEW', 1, 'APPROVED', 'VERIFIED',
            TIMESTAMPTZ '2026-07-01 09:00:00+06' + (review_number * INTERVAL '1 day'),
            TIMESTAMPTZ '2026-07-02 09:00:00+06' + (review_number * INTERVAL '1 day'),
            TIMESTAMPTZ '2026-07-02 09:00:00+06' + (review_number * INTERVAL '1 day')
          ) RETURNING submission_id INTO v_submission_id;

          INSERT INTO company_reviews (
            submission_id, role_id, review_title, overall_rating,
            work_life_balance_rating, career_growth_rating, management_rating,
            culture_rating, pros, cons, advice_to_management, employment_status, review_date
          ) VALUES (
            v_submission_id, scope_row.role_id, v_title,
            3.5 + (MOD(scope_row.company_id + review_number, 4) * 0.5),
            3.5 + (MOD(review_number, 3) * 0.5),
            3.5 + (MOD(review_number + 1, 3) * 0.5),
            3.5 + (MOD(scope_row.company_id + review_number, 3) * 0.5),
            3.5 + (MOD(scope_row.company_id + review_number + 1, 3) * 0.5),
            'Synthetic academic demonstration: structured learning opportunities and collaborative colleagues.',
            'Synthetic academic demonstration: workload and process consistency can vary.',
            'Synthetic academic demonstration: continue investing in clear feedback and planning.',
            'CURRENT', DATE '2026-05-01' + review_number
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END
$saple_seed$;

-- Explicit and generated IDs are both safe for subsequent runtime inserts.
SELECT setval(pg_get_serial_sequence('users', 'user_id'),
  COALESCE((SELECT MAX(user_id) FROM users), 1),
  EXISTS (SELECT 1 FROM users));

SELECT setval(pg_get_serial_sequence('employees', 'employee_id'),
  COALESCE((SELECT MAX(employee_id) FROM employees), 1),
  EXISTS (SELECT 1 FROM employees));

SELECT setval(pg_get_serial_sequence('companies', 'company_id'),
  COALESCE((SELECT MAX(company_id) FROM companies), 1),
  EXISTS (SELECT 1 FROM companies));

SELECT setval(pg_get_serial_sequence('job_roles', 'role_id'),
  COALESCE((SELECT MAX(role_id) FROM job_roles), 1),
  EXISTS (SELECT 1 FROM job_roles));

SELECT setval(pg_get_serial_sequence('benefits', 'benefit_id'),
  COALESCE((SELECT MAX(benefit_id) FROM benefits), 1),
  EXISTS (SELECT 1 FROM benefits));

SELECT setval(pg_get_serial_sequence('employment_verifications', 'verification_id'),
  COALESCE((SELECT MAX(verification_id) FROM employment_verifications), 1),
  EXISTS (SELECT 1 FROM employment_verifications));

SELECT setval(pg_get_serial_sequence('submissions', 'submission_id'),
  COALESCE((SELECT MAX(submission_id) FROM submissions), 1),
  EXISTS (SELECT 1 FROM submissions));

SELECT setval(pg_get_serial_sequence('reports', 'report_id'),
  COALESCE((SELECT MAX(report_id) FROM reports), 1),
  EXISTS (SELECT 1 FROM reports));

SELECT setval(pg_get_serial_sequence('moderation_actions', 'action_id'),
  COALESCE((SELECT MAX(action_id) FROM moderation_actions), 1),
  EXISTS (SELECT 1 FROM moderation_actions));

SELECT setval(pg_get_serial_sequence('password_reset_tokens', 'reset_token_id'),
  COALESCE((SELECT MAX(reset_token_id) FROM password_reset_tokens), 1),
  EXISTS (SELECT 1 FROM password_reset_tokens));

COMMIT;

