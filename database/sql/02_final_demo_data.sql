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
-- ================================================================
-- SECTION 2: REFERENCE DATA EXPANSION
-- ================================================================

-- Additive reference-data expansion for Saple.
--
-- Run after Section 1. MERGE keeps this section idempotent and
-- preserves all fictional demonstration records and user-generated content.
-- Company metadata sources are recorded in company_seed_sources.md.

MERGE INTO companies target
USING (
    SELECT 'Grameenphone' company_name, 'Telecommunications' industry, 'Dhaka' headquarters_city, 'Bangladesh' country, 'https://www.grameenphone.com' website, CAST(NULL AS VARCHAR2(30)) company_size, 'A Bangladesh telecommunications and digital services provider.' description FROM dual
    UNION ALL SELECT 'Robi Axiata', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.robi.com.bd', NULL, 'A mobile network and digital services provider in Bangladesh.' FROM dual
    UNION ALL SELECT 'Banglalink', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.banglalink.net', NULL, 'A digital communications service provider in Bangladesh.' FROM dual
    UNION ALL SELECT 'BRAC Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.bracbank.com', NULL, 'A private commercial bank with a focus that includes small and medium enterprises.' FROM dual
    UNION ALL SELECT 'City Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.citybankplc.com', NULL, 'A private commercial bank serving retail, business, and corporate customers.' FROM dual
    UNION ALL SELECT 'Eastern Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.ebl.com.bd', NULL, 'A private commercial bank providing consumer, SME, and corporate financial services.' FROM dual
    UNION ALL SELECT 'Dutch-Bangla Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.dutchbanglabank.com', NULL, 'A private commercial bank known for banking and electronic payment services.' FROM dual
    UNION ALL SELECT 'IDLC Finance', 'Financial Services', 'Dhaka', 'Bangladesh', 'https://idlc.com', NULL, 'A non-bank financial institution serving consumer, SME, and corporate clients.' FROM dual
    UNION ALL SELECT 'bKash', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://www.bkash.com', NULL, 'A mobile financial services provider operating in Bangladesh.' FROM dual
    UNION ALL SELECT 'Nagad', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://nagad.com.bd', NULL, 'A mobile financial service offering digital payments and money transfer services.' FROM dual
    UNION ALL SELECT 'Square Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://squarepharma.com.bd', NULL, 'A Bangladesh pharmaceutical manufacturer and healthcare company.' FROM dual
    UNION ALL SELECT 'Renata', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.renata-limited.com', NULL, 'A pharmaceutical and animal-health products manufacturer.' FROM dual
    UNION ALL SELECT 'Incepta Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.inceptapharma.com', NULL, 'A Bangladesh manufacturer of pharmaceutical products.' FROM dual
    UNION ALL SELECT 'Beximco Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.beximcopharma.com', NULL, 'A pharmaceutical manufacturer serving domestic and international markets.' FROM dual
    UNION ALL SELECT 'ACI', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.aci-bd.com', NULL, 'A Bangladesh group active in pharmaceuticals, consumer brands, agribusiness, and retail.' FROM dual
    UNION ALL SELECT 'PRAN-RFL Group', 'Consumer Goods', 'Dhaka', 'Bangladesh', 'https://www.pranrflgroup.com', NULL, 'A Bangladesh group producing food, beverages, plastics, and household products.' FROM dual
    UNION ALL SELECT 'Walton Hi-Tech Industries', 'Electronics Manufacturing', 'Gazipur', 'Bangladesh', 'https://waltonbd.com', '10000+', 'A Bangladesh manufacturer of electronics, electrical appliances, and technology products.' FROM dual
    UNION ALL SELECT 'Bashundhara Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.bashundharagroup.com', NULL, 'A Bangladesh group with businesses spanning manufacturing, property, media, and services.' FROM dual
    UNION ALL SELECT 'Akij Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://akij.net', NULL, 'A Bangladesh industrial group with operations across consumer and manufacturing sectors.' FROM dual
    UNION ALL SELECT 'Meghna Group of Industries', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.mgi.org', '10000+', 'A Bangladesh conglomerate active in consumer goods, materials, logistics, and industrial manufacturing.' FROM dual
    UNION ALL SELECT 'Beximco Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.beximco.com', NULL, 'A Bangladesh business group with operations in manufacturing and services.' FROM dual
    UNION ALL SELECT 'DBL Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://dbl-group.com', NULL, 'A diversified Bangladesh group with a foundation in apparel and textiles.' FROM dual
    UNION ALL SELECT 'Viyellatex Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://www.viyellatexgroup.com', '10000+', 'An integrated apparel and textile group based in Bangladesh.' FROM dual
    UNION ALL SELECT 'Brain Station 23', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://brainstation-23.com', NULL, 'A Bangladesh software development and digital transformation company.' FROM dual
    UNION ALL SELECT 'BJIT', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://bjitgroup.com', '501-1000', 'A software development and IT services company with Bangladesh operations.' FROM dual
    UNION ALL SELECT 'Enosis Solutions', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.enosisbd.com', NULL, 'A Bangladesh software engineering and quality assurance services company.' FROM dual
    UNION ALL SELECT 'Therap (Bangladesh)', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://therapbd.com', NULL, 'A Bangladesh software development operation building human-services applications.' FROM dual
    UNION ALL SELECT 'SSL Wireless', 'Financial Technology', 'Dhaka', 'Bangladesh', 'https://sslwireless.com', '201-500', 'A Bangladesh digital payments and technology infrastructure company.' FROM dual
    UNION ALL SELECT 'Pathao', 'Consumer Technology', 'Dhaka', 'Bangladesh', 'https://pathao.com', NULL, 'A Bangladesh consumer technology platform for mobility, delivery, logistics, and payments.' FROM dual
    UNION ALL SELECT 'Chaldal', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://chaldal.com', NULL, 'A Bangladesh online grocery and household essentials platform.' FROM dual
    UNION ALL SELECT 'ShopUp', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://shopup.org', NULL, 'A Bangladesh B2B commerce platform connecting manufacturers and neighborhood retailers.' FROM dual
    UNION ALL SELECT 'Daraz Bangladesh', 'E-commerce', 'Dhaka', 'Bangladesh', 'https://www.daraz.com.bd', NULL, 'The Bangladesh operation of a South Asian online marketplace.' FROM dual
    UNION ALL SELECT 'foodpanda Bangladesh', 'Consumer Technology', 'Dhaka', 'Bangladesh', 'https://www.foodpanda.com.bd', NULL, 'The Bangladesh operation of an online food and commerce delivery platform.' FROM dual
    UNION ALL SELECT 'BRAC', 'Nonprofit and Development', 'Dhaka', 'Bangladesh', 'https://www.brac.net', NULL, 'A Bangladesh-founded international development organization.' FROM dual
    UNION ALL SELECT 'Summit Group', 'Power and Infrastructure', 'Dhaka', 'Bangladesh', 'https://summitpowerinternational.com', NULL, 'A Bangladesh-origin infrastructure group focused on power generation and related services.' FROM dual
    UNION ALL SELECT 'Google', 'Technology', 'Mountain View', 'United States', 'https://about.google', NULL, 'A global technology company building internet, cloud, advertising, and computing products.' FROM dual
    UNION ALL SELECT 'Microsoft', 'Technology', 'Redmond', 'United States', 'https://www.microsoft.com', NULL, 'A global software, cloud, productivity, and computing company.' FROM dual
    UNION ALL SELECT 'Amazon', 'Technology and Retail', 'Seattle', 'United States', 'https://www.aboutamazon.com', NULL, 'A global company operating e-commerce, cloud computing, logistics, and digital services.' FROM dual
    UNION ALL SELECT 'IBM', 'Technology and Consulting', 'Armonk', 'United States', 'https://www.ibm.com', NULL, 'A global technology and consulting company.' FROM dual
    UNION ALL SELECT 'Oracle', 'Technology', 'Austin', 'United States', 'https://www.oracle.com', NULL, 'A global database, enterprise software, and cloud technology company.' FROM dual
    UNION ALL SELECT 'Samsung Electronics', 'Electronics Manufacturing', 'Suwon', 'South Korea', 'https://www.samsung.com', NULL, 'A global electronics and technology manufacturer.' FROM dual
    UNION ALL SELECT 'Unilever', 'Consumer Goods', 'London', 'United Kingdom', 'https://www.unilever.com', NULL, 'A global consumer goods company.' FROM dual
    UNION ALL SELECT 'Nestle', 'Food and Beverage', 'Vevey', 'Switzerland', 'https://www.nestle.com', NULL, 'A global food and beverage company.' FROM dual
    UNION ALL SELECT 'Siemens', 'Industrial Technology', 'Munich', 'Germany', 'https://www.siemens.com', NULL, 'A global industrial technology and infrastructure company.' FROM dual
    UNION ALL SELECT 'Deloitte', 'Professional Services', 'London', 'United Kingdom', 'https://www.deloitte.com', NULL, 'A global professional services organization.' FROM dual
    UNION ALL SELECT 'PwC', 'Professional Services', 'London', 'United Kingdom', 'https://www.pwc.com', NULL, 'A global assurance, tax, and consulting network.' FROM dual
    UNION ALL SELECT 'Maersk', 'Logistics and Shipping', 'Copenhagen', 'Denmark', 'https://www.maersk.com', NULL, 'A global logistics and shipping company.' FROM dual
    UNION ALL SELECT 'Toyota', 'Automotive Manufacturing', 'Toyota City', 'Japan', 'https://global.toyota', NULL, 'A global automotive and mobility manufacturer.' FROM dual
    UNION ALL SELECT 'Pfizer', 'Pharmaceuticals', 'New York', 'United States', 'https://www.pfizer.com', NULL, 'A global biopharmaceutical company.' FROM dual
    UNION ALL SELECT 'HSBC', 'Banking', 'London', 'United Kingdom', 'https://www.hsbc.com', NULL, 'A global banking and financial services organization.' FROM dual
) source
ON (UPPER(target.company_name) = UPPER(source.company_name))
WHEN NOT MATCHED THEN
    INSERT (company_name, industry, headquarters_city, country, website, company_size, description)
    VALUES (source.company_name, source.industry, source.headquarters_city, source.country, source.website, source.company_size, source.description);

MERGE INTO job_roles target
USING (
    SELECT 'Backend Engineer' role_name, 'Technology' role_category, 'Builds server-side applications, APIs, and services.' description FROM dual
    UNION ALL SELECT 'Frontend Engineer', 'Technology', 'Builds accessible web interfaces and client-side applications.' FROM dual
    UNION ALL SELECT 'Full Stack Engineer', 'Technology', 'Works across client, server, and data layers.' FROM dual
    UNION ALL SELECT 'Mobile Application Developer', 'Technology', 'Builds and maintains mobile applications.' FROM dual
    UNION ALL SELECT 'DevOps Engineer', 'Technology', 'Automates delivery pipelines and infrastructure operations.' FROM dual
    UNION ALL SELECT 'Cloud Engineer', 'Technology', 'Designs and operates cloud platforms and services.' FROM dual
    UNION ALL SELECT 'Site Reliability Engineer', 'Technology', 'Improves production reliability, observability, and performance.' FROM dual
    UNION ALL SELECT 'Cybersecurity Analyst', 'Technology', 'Monitors and reduces information security risk.' FROM dual
    UNION ALL SELECT 'Database Administrator', 'Technology', 'Operates, secures, and tunes database systems.' FROM dual
    UNION ALL SELECT 'Systems Administrator', 'Technology', 'Maintains computing systems and core services.' FROM dual
    UNION ALL SELECT 'Network Engineer', 'Technology', 'Designs and supports network infrastructure.' FROM dual
    UNION ALL SELECT 'Data Engineer', 'Data and Analytics', 'Builds reliable data platforms and pipelines.' FROM dual
    UNION ALL SELECT 'Data Scientist', 'Data and Analytics', 'Uses statistics and computation to develop data products and insights.' FROM dual
    UNION ALL SELECT 'Machine Learning Engineer', 'Data and Analytics', 'Builds and operates production machine learning systems.' FROM dual
    UNION ALL SELECT 'Business Intelligence Analyst', 'Data and Analytics', 'Develops reporting models and decision-support dashboards.' FROM dual
    UNION ALL SELECT 'Product Manager', 'Product and Design', 'Guides product strategy, priorities, and delivery.' FROM dual
    UNION ALL SELECT 'Project Manager', 'Business and Operations', 'Plans and coordinates projects, schedules, and stakeholders.' FROM dual
    UNION ALL SELECT 'Business Analyst', 'Business and Operations', 'Translates business needs into processes and requirements.' FROM dual
    UNION ALL SELECT 'UI/UX Designer', 'Product and Design', 'Researches and designs user interfaces and experiences.' FROM dual
    UNION ALL SELECT 'Graphic Designer', 'Product and Design', 'Creates visual communication and brand assets.' FROM dual
    UNION ALL SELECT 'Technical Writer', 'Product and Design', 'Creates clear product and technical documentation.' FROM dual
    UNION ALL SELECT 'Customer Success Manager', 'Customer and Support', 'Helps customers adopt products and achieve outcomes.' FROM dual
    UNION ALL SELECT 'Customer Support Specialist', 'Customer and Support', 'Resolves customer questions and service issues.' FROM dual
    UNION ALL SELECT 'Human Resources Officer', 'People and Administration', 'Supports employee programs and workplace policy.' FROM dual
    UNION ALL SELECT 'Talent Acquisition Specialist', 'People and Administration', 'Sources and recruits candidates for open roles.' FROM dual
    UNION ALL SELECT 'Operations Manager', 'Business and Operations', 'Plans and improves day-to-day business operations.' FROM dual
    UNION ALL SELECT 'Supply Chain Analyst', 'Supply Chain', 'Analyzes inventory, planning, and supply flow.' FROM dual
    UNION ALL SELECT 'Procurement Officer', 'Supply Chain', 'Sources goods and services and manages suppliers.' FROM dual
    UNION ALL SELECT 'Logistics Coordinator', 'Supply Chain', 'Coordinates transport, warehousing, and delivery.' FROM dual
    UNION ALL SELECT 'Accountant', 'Finance and Banking', 'Maintains accounts and prepares financial records.' FROM dual
    UNION ALL SELECT 'Financial Analyst', 'Finance and Banking', 'Evaluates financial performance and business decisions.' FROM dual
    UNION ALL SELECT 'Internal Auditor', 'Finance and Banking', 'Assesses controls, records, and operational compliance.' FROM dual
    UNION ALL SELECT 'Risk Analyst', 'Finance and Banking', 'Identifies, measures, and monitors business risk.' FROM dual
    UNION ALL SELECT 'Compliance Officer', 'Finance and Banking', 'Supports regulatory and policy compliance.' FROM dual
    UNION ALL SELECT 'Banking Officer', 'Finance and Banking', 'Provides banking operations and customer services.' FROM dual
    UNION ALL SELECT 'Sales Executive', 'Sales and Marketing', 'Develops customer relationships and sales opportunities.' FROM dual
    UNION ALL SELECT 'Marketing Executive', 'Sales and Marketing', 'Plans and delivers marketing activities.' FROM dual
    UNION ALL SELECT 'Digital Marketing Specialist', 'Sales and Marketing', 'Runs digital acquisition and engagement campaigns.' FROM dual
    UNION ALL SELECT 'Brand Manager', 'Sales and Marketing', 'Guides brand positioning and market programs.' FROM dual
    UNION ALL SELECT 'Medical Promotion Officer', 'Pharmaceuticals and Science', 'Communicates pharmaceutical product information to healthcare professionals.' FROM dual
    UNION ALL SELECT 'Pharmacist', 'Pharmaceuticals and Science', 'Supports safe preparation and use of medicines.' FROM dual
    UNION ALL SELECT 'Chemist', 'Pharmaceuticals and Science', 'Performs chemical research, analysis, and quality work.' FROM dual
    UNION ALL SELECT 'Laboratory Technologist', 'Pharmaceuticals and Science', 'Performs laboratory testing and maintains technical records.' FROM dual
    UNION ALL SELECT 'Production Engineer', 'Engineering and Manufacturing', 'Improves manufacturing processes and production performance.' FROM dual
    UNION ALL SELECT 'Industrial Engineer', 'Engineering and Manufacturing', 'Optimizes production systems, quality, and efficiency.' FROM dual
    UNION ALL SELECT 'Mechanical Engineer', 'Engineering and Manufacturing', 'Designs and maintains mechanical systems.' FROM dual
    UNION ALL SELECT 'Electrical Engineer', 'Engineering and Manufacturing', 'Designs and maintains electrical systems.' FROM dual
    UNION ALL SELECT 'Civil Engineer', 'Engineering and Construction', 'Designs and supervises civil infrastructure work.' FROM dual
    UNION ALL SELECT 'Architect', 'Engineering and Construction', 'Plans buildings and coordinates architectural design.' FROM dual
    UNION ALL SELECT 'Textile Engineer', 'Apparel and Textiles', 'Develops and improves textile production processes.' FROM dual
    UNION ALL SELECT 'Apparel Merchandiser', 'Apparel and Textiles', 'Coordinates apparel orders, costing, materials, and delivery.' FROM dual
    UNION ALL SELECT 'Agronomist', 'Agriculture', 'Applies crop and soil science to agricultural production.' FROM dual
    UNION ALL SELECT 'Teacher', 'Education and Research', 'Plans and delivers learning activities.' FROM dual
    UNION ALL SELECT 'Research Associate', 'Education and Research', 'Supports structured academic or commercial research.' FROM dual
    UNION ALL SELECT 'Management Trainee', 'Early Career', 'Completes a structured rotation across business functions.' FROM dual
) source
ON (UPPER(target.role_name) = UPPER(source.role_name))
WHEN NOT MATCHED THEN
    INSERT (role_name, role_category, description)
    VALUES (source.role_name, source.role_category, source.description);

COMMIT;
-- ================================================================
-- SECTION 3: SYNTHETIC SALARY AND REVIEW DEMO DATA
-- ================================================================

-- Saple additive seed 08: deterministic synthetic academic demonstration data
--
-- Run after the final schema and Sections 1-2. This section targets only the
-- four original sample companies and the fifty companies introduced by 05.
-- All generated accounts use the saple.demo.*@example.invalid convention.
-- Salary figures are fictional BDT/month examples, are not official company
-- salaries, and must never be used as trustworthy ML training data.

DECLARE
    v_demo_admin_id users.user_id%TYPE;
    v_user_id users.user_id%TYPE;
    v_employee_id employees.employee_id%TYPE;
    v_submission_id submissions.submission_id%TYPE;
    v_existing NUMBER;
    v_base_salary NUMBER(12,2);
    v_email users.email%TYPE;
    v_company_email employment_verifications.company_email%TYPE;
    v_title company_reviews.review_title%TYPE;
BEGIN
    MERGE INTO users target
    USING (
        SELECT 'Synthetic Demo Moderator' AS full_name,
               'saple.demo.moderator@example.invalid' AS email
        FROM dual
    ) source
    ON (LOWER(target.email) = LOWER(source.email))
    WHEN NOT MATCHED THEN INSERT (
        full_name, email, password_hash, user_type, account_role, account_status
    ) VALUES (
        source.full_name,
        source.email,
        '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
        'NORMAL',
        'ADMIN',
        'ACTIVE'
    );

    SELECT user_id INTO v_demo_admin_id
    FROM users
    WHERE LOWER(email) = 'saple.demo.moderator@example.invalid';

    FOR scope_row IN (
        WITH seeded_names (company_name) AS (
            SELECT 'Aster Byte Limited' FROM dual
            UNION ALL SELECT 'Meghna Analytics' FROM dual
            UNION ALL SELECT 'Northstar Fintech' FROM dual
            UNION ALL SELECT 'Green Delta Robotics' FROM dual
            UNION ALL SELECT 'Grameenphone' FROM dual
            UNION ALL SELECT 'Robi Axiata' FROM dual
            UNION ALL SELECT 'Banglalink' FROM dual
            UNION ALL SELECT 'BRAC Bank' FROM dual
            UNION ALL SELECT 'City Bank' FROM dual
            UNION ALL SELECT 'Eastern Bank' FROM dual
            UNION ALL SELECT 'Dutch-Bangla Bank' FROM dual
            UNION ALL SELECT 'IDLC Finance' FROM dual
            UNION ALL SELECT 'bKash' FROM dual
            UNION ALL SELECT 'Nagad' FROM dual
            UNION ALL SELECT 'Square Pharmaceuticals' FROM dual
            UNION ALL SELECT 'Renata' FROM dual
            UNION ALL SELECT 'Incepta Pharmaceuticals' FROM dual
            UNION ALL SELECT 'Beximco Pharmaceuticals' FROM dual
            UNION ALL SELECT 'ACI' FROM dual
            UNION ALL SELECT 'PRAN-RFL Group' FROM dual
            UNION ALL SELECT 'Walton Hi-Tech Industries' FROM dual
            UNION ALL SELECT 'Bashundhara Group' FROM dual
            UNION ALL SELECT 'Akij Group' FROM dual
            UNION ALL SELECT 'Meghna Group of Industries' FROM dual
            UNION ALL SELECT 'Beximco Group' FROM dual
            UNION ALL SELECT 'DBL Group' FROM dual
            UNION ALL SELECT 'Viyellatex Group' FROM dual
            UNION ALL SELECT 'Brain Station 23' FROM dual
            UNION ALL SELECT 'BJIT' FROM dual
            UNION ALL SELECT 'Enosis Solutions' FROM dual
            UNION ALL SELECT 'Therap (Bangladesh)' FROM dual
            UNION ALL SELECT 'SSL Wireless' FROM dual
            UNION ALL SELECT 'Pathao' FROM dual
            UNION ALL SELECT 'Chaldal' FROM dual
            UNION ALL SELECT 'ShopUp' FROM dual
            UNION ALL SELECT 'Daraz Bangladesh' FROM dual
            UNION ALL SELECT 'foodpanda Bangladesh' FROM dual
            UNION ALL SELECT 'BRAC' FROM dual
            UNION ALL SELECT 'Summit Group' FROM dual
            UNION ALL SELECT 'Google' FROM dual
            UNION ALL SELECT 'Microsoft' FROM dual
            UNION ALL SELECT 'Amazon' FROM dual
            UNION ALL SELECT 'IBM' FROM dual
            UNION ALL SELECT 'Oracle' FROM dual
            UNION ALL SELECT 'Samsung Electronics' FROM dual
            UNION ALL SELECT 'Unilever' FROM dual
            UNION ALL SELECT 'Nestle' FROM dual
            UNION ALL SELECT 'Siemens' FROM dual
            UNION ALL SELECT 'Deloitte' FROM dual
            UNION ALL SELECT 'PwC' FROM dual
            UNION ALL SELECT 'Maersk' FROM dual
            UNION ALL SELECT 'Toyota' FROM dual
            UNION ALL SELECT 'Pfizer' FROM dual
            UNION ALL SELECT 'HSBC' FROM dual
        ),
        company_roles AS (
            SELECT c.company_id, c.company_name, c.industry,
                CASE
                    WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Pharmacist'
                    WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%' THEN 'Textile Engineer'
                    WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES' THEN 'Banking Officer'
                    WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Data Engineer'
                    WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
                      OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
                      OR UPPER(c.industry) LIKE '%POWER%' THEN 'Production Engineer'
                    WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
                      OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Operations Manager'
                    WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Project Manager'
                    WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%' THEN 'Business Analyst'
                    WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%' THEN 'Logistics Coordinator'
                    ELSE 'Backend Engineer'
                END AS primary_role,
                CASE
                    WHEN UPPER(c.industry) LIKE '%PHARM%' THEN 'Medical Promotion Officer'
                    WHEN UPPER(c.industry) LIKE '%APPAREL%' OR UPPER(c.industry) LIKE '%TEXTILE%' THEN 'Apparel Merchandiser'
                    WHEN UPPER(c.industry) LIKE '%BANK%' OR UPPER(c.industry) = 'FINANCIAL SERVICES' THEN 'Risk Analyst'
                    WHEN UPPER(c.industry) LIKE '%DATA%' THEN 'Business Intelligence Analyst'
                    WHEN UPPER(c.industry) LIKE '%ELECTRON%' OR UPPER(c.industry) LIKE '%INDUSTRIAL%'
                      OR UPPER(c.industry) LIKE '%ROBOT%' OR UPPER(c.industry) LIKE '%AUTOMOTIVE%'
                      OR UPPER(c.industry) LIKE '%POWER%' THEN 'Electrical Engineer'
                    WHEN UPPER(c.industry) LIKE '%CONSUMER GOODS%' OR UPPER(c.industry) LIKE '%FOOD%'
                      OR UPPER(c.industry) = 'DIVERSIFIED' THEN 'Supply Chain Analyst'
                    WHEN UPPER(c.industry) LIKE '%NONPROFIT%' THEN 'Research Associate'
                    WHEN UPPER(c.industry) LIKE '%PROFESSIONAL%' OR UPPER(c.industry) LIKE '%CONSULT%' THEN 'Internal Auditor'
                    WHEN UPPER(c.industry) LIKE '%LOGISTICS%' OR UPPER(c.industry) LIKE '%SHIPPING%' THEN 'Supply Chain Analyst'
                    ELSE 'Data Engineer'
                END AS secondary_role
            FROM companies c
            JOIN seeded_names n ON UPPER(n.company_name) = UPPER(c.company_name)
        ),
        scope_names AS (
            SELECT company_id, company_name, industry, primary_role AS role_name, 1 AS scope_order
            FROM company_roles
            UNION ALL
            SELECT company_id, company_name, industry, secondary_role AS role_name, 2 AS scope_order
            FROM company_roles
        )
        SELECT s.company_id, s.company_name, s.industry, s.scope_order,
               jr.role_id, jr.role_name, jr.role_category
        FROM scope_names s
        JOIN job_roles jr ON UPPER(jr.role_name) = UPPER(s.role_name)
        ORDER BY s.company_id, s.scope_order
    ) LOOP
        v_email := 'saple.demo.c' || scope_row.company_id || '.r' || scope_row.role_id || '@example.invalid';
        v_company_email := 'saple.demo.c' || scope_row.company_id || '.r' || scope_row.role_id || '@verification.invalid';

        INSERT INTO users (
            full_name, email, password_hash, user_type, account_role, account_status
        )
        SELECT 'Synthetic Demo Employee C' || scope_row.company_id || ' R' || scope_row.role_id,
               v_email,
               '$2b$12$EHokZ8vUNnpNotyJ0fds0e.AjAlIRmg76aJXrPLs34Xo7K3ECITnm',
               'EMPLOYEE', 'USER', 'ACTIVE'
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1 FROM users WHERE LOWER(email) = LOWER(v_email)
        );

        SELECT user_id INTO v_user_id
        FROM users
        WHERE LOWER(email) = LOWER(v_email);

        INSERT INTO employees (user_id, employment_status)
        SELECT v_user_id, 'CURRENT'
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1 FROM employees WHERE user_id = v_user_id
        );

        SELECT employee_id INTO v_employee_id
        FROM employees
        WHERE user_id = v_user_id;

        INSERT INTO employment_verifications (
            employee_id, company_id, role_id, verification_method, company_email,
            proof_type, proof_reference, verification_status, requested_at,
            reviewed_at, expires_at, rejection_reason, reviewed_by
        )
        SELECT v_employee_id, scope_row.company_id, scope_row.role_id,
               'COMPANY_EMAIL_OTP', v_company_email, NULL, NULL, 'VERIFIED',
               TIMESTAMP '2026-05-01 09:00:00', TIMESTAMP '2026-05-01 10:00:00',
               TIMESTAMP '2035-05-01 10:00:00', NULL, v_demo_admin_id
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1
            FROM employment_verifications ev
            WHERE ev.employee_id = v_employee_id
              AND ev.company_id = scope_row.company_id
              AND ev.role_id = scope_row.role_id
              AND ev.company_email = v_company_email
        );

        IF UPPER(scope_row.role_category) LIKE '%TECH%'
           OR UPPER(scope_row.role_category) LIKE '%DATA%'
           OR UPPER(scope_row.role_category) LIKE '%ENGINEER%' THEN
            v_base_salary := 65000;
        ELSIF UPPER(scope_row.role_category) LIKE '%FINANCE%'
           OR UPPER(scope_row.role_category) LIKE '%BANK%' THEN
            v_base_salary := 58000;
        ELSIF UPPER(scope_row.role_category) LIKE '%PHARM%' THEN
            v_base_salary := 50000;
        ELSIF UPPER(scope_row.role_category) LIKE '%SUPPLY%'
           OR UPPER(scope_row.role_category) LIKE '%MANUFACTUR%' THEN
            v_base_salary := 48000;
        ELSE
            v_base_salary := 52000;
        END IF;

        FOR salary_number IN 1..5 LOOP
            v_base_salary := v_base_salary + 3500;
            SELECT COUNT(*) INTO v_existing
            FROM submissions s
            JOIN salary_submissions ss ON ss.submission_id = s.submission_id
            WHERE s.user_id = v_user_id
              AND s.company_id = scope_row.company_id
              AND s.submission_type = 'SALARY'
              AND ss.role_id = scope_row.role_id
              AND ss.salary_year = 2026
              AND ss.years_of_experience = salary_number
              AND ss.base_salary = v_base_salary;

            IF v_existing = 0 THEN
                INSERT INTO submissions (
                    user_id, company_id, submission_type, is_anonymous,
                    submission_status, verification_status, submitted_at,
                    approved_at, updated_at
                ) VALUES (
                    v_user_id, scope_row.company_id, 'SALARY', 1,
                    'APPROVED', 'VERIFIED',
                    TIMESTAMP '2026-06-01 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY'),
                    TIMESTAMP '2026-06-02 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY'),
                    TIMESTAMP '2026-06-02 09:00:00' + NUMTODSINTERVAL(MOD(scope_row.company_id, 20) + salary_number, 'DAY')
                ) RETURNING submission_id INTO v_submission_id;

                INSERT INTO salary_submissions (
                    submission_id, role_id, base_salary, additional_compensation,
                    currency, pay_period, years_of_experience, employment_type,
                    work_mode, salary_year
                ) VALUES (
                    v_submission_id, scope_row.role_id, v_base_salary,
                    3000 + (salary_number * 1000), 'BDT', 'MONTHLY', salary_number,
                    'FULL_TIME',
                    CASE MOD(salary_number, 3)
                        WHEN 0 THEN 'REMOTE'
                        WHEN 1 THEN 'ONSITE'
                        ELSE 'HYBRID'
                    END,
                    2026
                );
            END IF;
        END LOOP;

        IF scope_row.scope_order = 1 THEN
            FOR review_number IN 1..3 LOOP
                v_title := 'Synthetic academic demo review ' || review_number;
                SELECT COUNT(*) INTO v_existing
                FROM submissions s
                JOIN company_reviews cr ON cr.submission_id = s.submission_id
                WHERE s.user_id = v_user_id
                  AND s.company_id = scope_row.company_id
                  AND s.submission_type = 'REVIEW'
                  AND cr.role_id = scope_row.role_id
                  AND cr.review_title = v_title;

                IF v_existing = 0 THEN
                    INSERT INTO submissions (
                        user_id, company_id, submission_type, is_anonymous,
                        submission_status, verification_status, submitted_at,
                        approved_at, updated_at
                    ) VALUES (
                        v_user_id, scope_row.company_id, 'REVIEW', 1,
                        'APPROVED', 'VERIFIED',
                        TIMESTAMP '2026-07-01 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY'),
                        TIMESTAMP '2026-07-02 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY'),
                        TIMESTAMP '2026-07-02 09:00:00' + NUMTODSINTERVAL(review_number, 'DAY')
                    ) RETURNING submission_id INTO v_submission_id;

                    INSERT INTO company_reviews (
                        submission_id, role_id, review_title, overall_rating,
                        work_life_balance_rating, career_growth_rating,
                        management_rating, culture_rating, pros, cons,
                        advice_to_management, employment_status, review_date
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

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

-- ================================================================
-- Verification queries
-- ================================================================

-- Total synthetic salary submissions (expected: 540 when all 54 companies
-- and both mapped roles exist).
SELECT COUNT(*) AS demo_salary_submissions
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_type = 'SALARY';

-- Approved counts by company and role.
SELECT c.company_name, jr.role_name, COUNT(*) AS approved_salary_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
JOIN companies c ON c.company_id = s.company_id
JOIN job_roles jr ON jr.role_id = ss.role_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY c.company_name, jr.role_name
ORDER BY c.company_name, jr.role_name;

-- Must return zero rows: any demo company-role group below five salaries.
SELECT s.company_id, ss.role_id, COUNT(*) AS approved_salary_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY s.company_id, ss.role_id
HAVING COUNT(*) < 5;

-- Verified versus community-eligible demo counts. Community includes every
-- approved row; verified is the trusted subset used by the verified view.
SELECT COUNT(*) AS community_eligible_count,
       SUM(CASE WHEN s.verification_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED';

-- Both public salary views must expose the demo groups.
SELECT 'VERIFIED' AS salary_view, COUNT(*) AS group_count
FROM vw_verified_salary_summary
WHERE company_id IN (
    SELECT DISTINCT s.company_id FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
)
UNION ALL
SELECT 'COMMUNITY', COUNT(*)
FROM vw_community_salary_summary
WHERE company_id IN (
    SELECT DISTINCT s.company_id FROM submissions s
    JOIN users u ON u.user_id = s.user_id
    WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
);

-- Approved review counts and averages (expected at least 3 per company).
SELECT c.company_name, COUNT(*) AS approved_review_count,
       ROUND(AVG(cr.overall_rating), 1) AS average_rating
FROM submissions s
JOIN company_reviews cr ON cr.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
JOIN companies c ON c.company_id = s.company_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND s.submission_status = 'APPROVED'
GROUP BY c.company_name
ORDER BY c.company_name;

-- Must return zero: parent/subtype orphans among demo rows.
SELECT 'SALARY_WITHOUT_PARENT' AS problem, ss.submission_id
FROM salary_submissions ss
LEFT JOIN submissions s ON s.submission_id = ss.submission_id
WHERE s.submission_id IS NULL
UNION ALL
SELECT 'REVIEW_WITHOUT_PARENT', cr.submission_id
FROM company_reviews cr
LEFT JOIN submissions s ON s.submission_id = cr.submission_id
WHERE s.submission_id IS NULL;

-- Must return zero: invalid scope references for synthetic demo users.
SELECT s.submission_id
FROM submissions s
JOIN users u ON u.user_id = s.user_id
LEFT JOIN employees e ON e.user_id = s.user_id
LEFT JOIN salary_submissions ss ON ss.submission_id = s.submission_id
LEFT JOIN company_reviews cr ON cr.submission_id = s.submission_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
  AND (
      e.employee_id IS NULL
      OR NOT EXISTS (
          SELECT 1 FROM employment_verifications ev
          WHERE ev.employee_id = e.employee_id
            AND ev.company_id = s.company_id
            AND ev.role_id = COALESCE(ss.role_id, cr.role_id)
            AND ev.verification_status = 'VERIFIED'
            AND (ev.expires_at IS NULL OR ev.expires_at > SYSTIMESTAMP)
      )
  );

-- Must return zero: duplicate deterministic synthetic salary markers.
SELECT s.user_id, s.company_id, ss.role_id, ss.salary_year,
       ss.years_of_experience, ss.base_salary, COUNT(*) AS duplicate_count
FROM submissions s
JOIN salary_submissions ss ON ss.submission_id = s.submission_id
JOIN users u ON u.user_id = s.user_id
WHERE LOWER(u.email) LIKE 'saple.demo.c%.r%@example.invalid'
GROUP BY s.user_id, s.company_id, ss.role_id, ss.salary_year,
         ss.years_of_experience, ss.base_salary
HAVING COUNT(*) > 1;
