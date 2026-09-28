-- ===========================================================================
-- SAPLE OPTIONAL BULK DEMONSTRATION DATA (PostgreSQL / Supabase)
-- ===========================================================================
--
-- What this is
--   An OPTIONAL academic/demo population script. It enlarges an already
--   prepared Saple database (schema from 01 or migrations 001-008, plus the
--   demo data from 02) so the site looks like it has been used by many people.
--
-- What this is NOT
--   Not a schema migration: it creates, alters and drops no table, column,
--   constraint, index, view or routine. Never add it to migrations/.
--   Not required: a fresh install works without it.
--
-- Honesty rule
--   Company reference rows use real company names with public metadata from
--   each company's official website (sources in database/company_seed_sources.md).
--   EVERYTHING ELSE here is SYNTHETIC ACADEMIC DEMO DATA: every person, email,
--   profile, verification, salary, review, rating, interview experience, job
--   vacancy and application is invented. None of it is a real submission
--   from, or a claim about, any company. Names are fictional combinations.
--
-- Safety
--   * Adds rows only. Nothing is dropped, truncated or deleted from any
--     table (its own temporary working tables vanish at commit), and no
--     existing row is changed except that synthetic users created here get
--     profile text.
--   * No hard-coded IDs: companies, roles, benefits and users are looked up
--     by their unique names or emails, and new rows take IDs from the tables'
--     own sequences, so nothing collides with live data.
--   * Re-runnable: reference data uses ON CONFLICT DO NOTHING, and every
--     activity section is skipped when its synthetic rows already exist.
--   * Synthetic accounts carry an unusable placeholder password hash, so
--     nobody can sign in as them, and 05_remove_bulk_demo_data.sql can find
--     exactly what this file created.
--   * One transaction: it all applies, or none of it does.
--
-- Requirements: migration 008 (professional profiles) and at least one ACTIVE
-- administrator account, who is recorded as the approver of the synthetic
-- company-representative assignments.
--
-- Run it once in the Supabase SQL editor (or psql) after rehearsing on a copy.
-- The read-only summary at the end shows what the database now contains.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preconditions and session-only helpers (pg_temp: nothing is left behind)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.user_experience') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 008_public_profiles_and_search.sql before this script.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE account_role = 'ADMIN' AND account_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'An ACTIVE administrator account is required before loading the bulk demo data.';
  END IF;
END $$;

-- The placeholder hash that marks every synthetic account created here.
-- Registration always stores a real 60-character bcrypt hash, so no real
-- account can ever carry this value, and no password matches it.
CREATE OR REPLACE FUNCTION pg_temp.bulk_marker() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT '$2b$10$SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN'::TEXT $$;

-- Deterministic pseudo-random number in [0, 1) from a text seed.
CREATE OR REPLACE FUNCTION pg_temp.bulk_rand(seed TEXT) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || SUBSTR(MD5(seed), 1, 8))::BIT(32)::BIGINT / 4294967296.0
$$;

CREATE OR REPLACE FUNCTION pg_temp.bulk_pick(options TEXT[], seed TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT options[1 + FLOOR(pg_temp.bulk_rand(seed) * CARDINALITY(options))::INT]
$$;

-- Two different options as sentences: "First. Second."
CREATE OR REPLACE FUNCTION pg_temp.bulk_two(options TEXT[], seed TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT options[a] || '. '
    || options[1 + ((a + FLOOR(pg_temp.bulk_rand(seed || ':b') * (CARDINALITY(options) - 1))::INT) % CARDINALITY(options))]
    || '.'
  FROM (SELECT 1 + FLOOR(pg_temp.bulk_rand(seed || ':a') * CARDINALITY(options))::INT AS a) chosen
$$;

-- Broad company category from the industry text.
CREATE OR REPLACE FUNCTION pg_temp.bulk_category(industry TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN industry ~* 'telecom' THEN 'telecom'
    WHEN industry ~* 'financial technology|fintech' THEN 'fintech'
    WHEN industry ~* 'bank|financial services' THEN 'bank'
    WHEN industry ~* 'nonprofit|development|research|microfinance' THEN 'development'
    WHEN industry ~* 'pharma' THEN 'pharma'
    WHEN industry ~* 'consumer technology|e-commerce|logistics|shipping' THEN 'commerce'
    WHEN industry ~* 'apparel|textile' THEN 'textile'
    WHEN industry ~* 'consumer goods|food|beverage' THEN 'fmcg'
    WHEN industry ~* 'industrial|manufacturing|electronics|steel|automotive|robotics|power|energy|infrastructure' THEN 'industrial'
    WHEN industry ~* 'software|technology|data|semiconductor|networking|it services' THEN 'tech'
    WHEN industry ~* 'consulting|professional services' THEN 'consulting'
    ELSE 'conglomerate'
  END
$$;

-- Job family from a role's category, used for text, skills and pay.
CREATE OR REPLACE FUNCTION pg_temp.bulk_family(role_category TEXT, role_name TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN role_name IN ('Product Manager', 'Project Manager', 'Business Analyst') THEN 'product'
    WHEN role_category IN ('Engineering', 'Technology') THEN 'tech'
    WHEN role_category IN ('Data', 'Data and Analytics') THEN 'data'
    WHEN role_category IN ('Design', 'Product and Design') THEN 'design'
    WHEN role_category = 'Finance and Banking' THEN 'finance'
    WHEN role_category IN ('Engineering and Manufacturing', 'Engineering and Construction', 'Apparel and Textiles') THEN 'industrial'
    WHEN role_category IN ('Pharmaceuticals and Science', 'Agriculture', 'Education and Research') THEN 'science'
    WHEN role_category = 'People and Administration' THEN 'people'
    WHEN role_category = 'Sales and Marketing' THEN 'marketing'
    WHEN role_category = 'Early Career' THEN 'early'
    ELSE 'business'
  END
$$;

-- Pay model. Monthly BDT for Bangladesh, yearly local currency elsewhere; the
-- "mid" figure is a mid-level software engineer, scaled by category, role,
-- seniority and a per-company factor. Plausible demo figures, not market data.
CREATE OR REPLACE FUNCTION pg_temp.bulk_currency(country TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE country
    WHEN 'Bangladesh' THEN 'BDT' WHEN 'United Kingdom' THEN 'GBP'
    WHEN 'Germany' THEN 'EUR' WHEN 'Ireland' THEN 'EUR' WHEN 'Switzerland' THEN 'CHF'
    WHEN 'Denmark' THEN 'DKK' WHEN 'Japan' THEN 'JPY' WHEN 'South Korea' THEN 'KRW'
    WHEN 'India' THEN 'INR' ELSE 'USD' END
$$;

CREATE OR REPLACE FUNCTION pg_temp.bulk_mid(country TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE country
    WHEN 'Bangladesh' THEN 110000 WHEN 'United States' THEN 150000
    WHEN 'United Kingdom' THEN 68000 WHEN 'Germany' THEN 70000 WHEN 'Ireland' THEN 72000
    WHEN 'Switzerland' THEN 115000 WHEN 'Denmark' THEN 600000 WHEN 'Japan' THEN 7800000
    WHEN 'South Korea' THEN 68000000 WHEN 'India' THEN 1600000 ELSE 90000 END::NUMERIC
$$;

CREATE OR REPLACE FUNCTION pg_temp.bulk_unit(country TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE country
    WHEN 'Bangladesh' THEN 500 WHEN 'Japan' THEN 10000 WHEN 'South Korea' THEN 100000
    WHEN 'India' THEN 10000 WHEN 'Denmark' THEN 5000 ELSE 1000 END::NUMERIC
$$;

CREATE OR REPLACE FUNCTION pg_temp.bulk_category_factor(category TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE category
    WHEN 'tech' THEN 1.00 WHEN 'telecom' THEN 1.00 WHEN 'fintech' THEN 1.05
    WHEN 'bank' THEN 0.82 WHEN 'pharma' THEN 0.85 WHEN 'fmcg' THEN 0.95
    WHEN 'industrial' THEN 0.80 WHEN 'textile' THEN 0.70 WHEN 'commerce' THEN 0.85
    WHEN 'consulting' THEN 0.90 WHEN 'development' THEN 0.75 ELSE 0.78 END
$$;

CREATE OR REPLACE FUNCTION pg_temp.bulk_role_factor(role_category TEXT, role_name TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN role_name = 'Product Manager' THEN 1.15
    WHEN role_name IN ('Machine Learning Engineer', 'Data Scientist', 'Site Reliability Engineer', 'Cloud Engineer') THEN 1.08
    WHEN role_name = 'Relationship Manager' THEN 0.85
    WHEN role_name = 'Medical Promotion Officer' THEN 0.55
    WHEN role_category IN ('Engineering', 'Technology') THEN 1.00
    WHEN role_category IN ('Data', 'Data and Analytics') THEN 0.98
    WHEN role_category IN ('Design', 'Product and Design') THEN 0.86
    WHEN role_category = 'Business and Operations' THEN 0.84
    WHEN role_category = 'Finance and Banking' THEN 0.80
    WHEN role_category = 'People and Administration' THEN 0.68
    WHEN role_category = 'Sales and Marketing' THEN 0.70
    WHEN role_category = 'Customer and Support' THEN 0.55
    WHEN role_category = 'Supply Chain' THEN 0.70
    WHEN role_category = 'Pharmaceuticals and Science' THEN 0.68
    WHEN role_category IN ('Engineering and Manufacturing', 'Engineering and Construction') THEN 0.74
    WHEN role_category = 'Apparel and Textiles' THEN 0.62
    WHEN role_category = 'Early Career' THEN 0.55
    ELSE 0.62 END
$$;

-- Seniority multiplier from years of experience. Trainee programmes are paid
-- as a programme, not by experience.
CREATE OR REPLACE FUNCTION pg_temp.bulk_level_factor(years NUMERIC, role_category TEXT, intern BOOLEAN) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN intern THEN 0.24
    WHEN role_category = 'Early Career' THEN 1.00
    WHEN years < 1 THEN 0.48 WHEN years < 3 THEN 0.70 WHEN years < 6 THEN 1.00
    WHEN years < 10 THEN 1.50 ELSE 2.10 END
$$;

-- ---------------------------------------------------------------------------
-- 1. Companies: real organisations, public metadata only (see
--    database/company_seed_sources.md). Existing names are left untouched.
-- ---------------------------------------------------------------------------

INSERT INTO companies (company_name, industry, headquarters_city, country, website, company_size, description) VALUES
  ('REVE Systems', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.revesoft.com', NULL, 'A Bangladesh software company building communication and business software products.'),
  ('DataSoft Systems Bangladesh', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://datasoft-bd.com', NULL, 'A Bangladesh software and IT solutions company.'),
  ('Tiger IT Bangladesh', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.tigerit.com', NULL, 'A Bangladesh software company known for identity and biometric systems.'),
  ('Cefalo Bangladesh', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.cefalo.com', NULL, 'The Bangladesh engineering centre of a Norwegian software company.'),
  ('Kaz Software', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://kaz.com.bd', NULL, 'A Bangladesh software development company working with international clients.'),
  ('SELISE Digital Platforms', 'Software and IT Services', 'Zurich', 'Switzerland', 'https://selise.ch', NULL, 'A Swiss software company with a large engineering presence in Bangladesh.'),
  ('Vivasoft', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://vivasoftltd.com', NULL, 'A Bangladesh software development and outsourcing company.'),
  ('Dynamic Solution Innovators', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.dsinnovators.com', NULL, 'A Bangladesh software development company.'),
  ('Southtech', 'Software and IT Services', 'Dhaka', 'Bangladesh', 'https://www.southtechgroup.com', NULL, 'A Bangladesh software and enterprise solutions group.'),
  ('Teletalk Bangladesh', 'Telecommunications', 'Dhaka', 'Bangladesh', 'https://www.teletalk.com.bd', NULL, 'The state-owned mobile operator of Bangladesh.'),
  ('IFIC Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.ificbank.com.bd', NULL, 'A private commercial bank in Bangladesh.'),
  ('Mutual Trust Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.mutualtrustbank.com', NULL, 'A private commercial bank in Bangladesh.'),
  ('Prime Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.primebank.com.bd', NULL, 'A private commercial bank in Bangladesh.'),
  ('Bank Asia', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.bankasia-bd.com', NULL, 'A private commercial bank in Bangladesh.'),
  ('Islami Bank Bangladesh', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.islamibankbd.com', '10000+', 'A Shariah-based commercial bank in Bangladesh.'),
  ('Pubali Bank', 'Banking', 'Dhaka', 'Bangladesh', 'https://www.pubalibangla.com', NULL, 'A private commercial bank in Bangladesh.'),
  ('Eskayef Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.skfbd.com', NULL, 'A Bangladesh pharmaceutical manufacturer.'),
  ('Healthcare Pharmaceuticals', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.hplbd.com', NULL, 'A Bangladesh pharmaceutical manufacturer.'),
  ('ACME Laboratories', 'Pharmaceuticals', 'Dhaka', 'Bangladesh', 'https://www.acmeglobal.com', NULL, 'A Bangladesh pharmaceutical manufacturer.'),
  ('Marico Bangladesh', 'Consumer Goods', 'Dhaka', 'Bangladesh', 'https://marico.com/bangladesh', NULL, 'The Bangladesh consumer-goods business of Marico.'),
  ('City Group', 'Consumer Goods', 'Dhaka', 'Bangladesh', 'https://www.citygroup.com.bd', NULL, 'A Bangladesh consumer-goods and food manufacturing group.'),
  ('BSRM', 'Steel Manufacturing', 'Chattogram', 'Bangladesh', 'https://www.bsrm.com', NULL, 'A Bangladesh steel manufacturer.'),
  ('Abul Khair Group', 'Diversified', 'Chattogram', 'Bangladesh', 'https://www.abulkhairgroup.com', NULL, 'A Bangladesh industrial group with businesses including steel and consumer goods.'),
  ('Rahimafrooz', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.rahimafrooz.com', NULL, 'A Bangladesh group with businesses in energy storage, automotive and power solutions.'),
  ('Ha-Meem Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://www.hameemgroup.net', NULL, 'A Bangladesh apparel and textile manufacturing group.'),
  ('Epyllion Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://www.epylliongroup.com', NULL, 'A Bangladesh apparel and textile manufacturing group.'),
  ('Envoy Textiles', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://www.envoytextiles.com', NULL, 'A Bangladesh denim fabric manufacturer.'),
  ('RedX', 'Logistics', 'Dhaka', 'Bangladesh', 'https://redx.com.bd', NULL, 'A Bangladesh delivery and logistics service.'),
  ('Paperfly', 'Logistics', 'Dhaka', 'Bangladesh', 'https://paperfly.com.bd', NULL, 'A Bangladesh e-commerce delivery and logistics company.'),
  ('Shohoz', 'Consumer Technology', 'Dhaka', 'Bangladesh', 'https://www.shohoz.com', NULL, 'A Bangladesh platform for ticketing and travel services.'),
  ('LightCastle Partners', 'Management Consulting', 'Dhaka', 'Bangladesh', 'https://lightcastlepartners.com', NULL, 'A Bangladesh management consulting and research firm.'),
  ('icddr,b', 'Health Research', 'Dhaka', 'Bangladesh', 'https://www.icddrb.org', NULL, 'An international health research institute based in Dhaka.'),
  ('ASA', 'Microfinance', 'Dhaka', 'Bangladesh', 'https://asa.org.bd', '10000+', 'A Bangladesh microfinance organisation.'),
  ('Meta', 'Technology', 'Menlo Park', 'United States', 'https://about.meta.com', '10000+', 'A global technology company building social and communication products.'),
  ('Apple', 'Technology', 'Cupertino', 'United States', 'https://www.apple.com', '10000+', 'A global technology company designing consumer devices, software and services.'),
  ('SAP', 'Enterprise Software', 'Walldorf', 'Germany', 'https://www.sap.com', '10000+', 'A global enterprise software company.'),
  ('Salesforce', 'Enterprise Software', 'San Francisco', 'United States', 'https://www.salesforce.com', '10000+', 'A global enterprise software company focused on customer relationship management.'),
  ('Accenture', 'Professional Services', 'Dublin', 'Ireland', 'https://www.accenture.com', '10000+', 'A global professional services company.'),
  ('Infosys', 'IT Services', 'Bengaluru', 'India', 'https://www.infosys.com', '10000+', 'A global IT services and consulting company.'),
  ('Tata Consultancy Services', 'IT Services', 'Mumbai', 'India', 'https://www.tcs.com', '10000+', 'A global IT services and consulting company.'),
  ('NVIDIA', 'Semiconductors', 'Santa Clara', 'United States', 'https://www.nvidia.com', '10000+', 'A global company designing graphics and accelerated computing chips.'),
  ('Intel', 'Semiconductors', 'Santa Clara', 'United States', 'https://www.intel.com', '10000+', 'A global semiconductor company.'),
  ('Cisco', 'Networking Technology', 'San Jose', 'United States', 'https://www.cisco.com', '10000+', 'A global networking and security technology company.'),
  ('EY', 'Professional Services', 'London', 'United Kingdom', 'https://www.ey.com', '10000+', 'A global professional services network.'),
  ('KPMG', 'Professional Services', 'London', 'United Kingdom', 'https://kpmg.com', '10000+', 'A global professional services network.'),
  ('Boston Consulting Group', 'Management Consulting', 'Boston', 'United States', 'https://www.bcg.com', '10000+', 'A global management consulting firm.'),
  ('Standard Chartered', 'Banking', 'London', 'United Kingdom', 'https://www.sc.com', '10000+', 'An international banking group.'),
  ('Citi', 'Banking', 'New York', 'United States', 'https://www.citigroup.com', '10000+', 'A global banking group.'),
  ('JPMorgan Chase', 'Banking', 'New York', 'United States', 'https://www.jpmorganchase.com', '10000+', 'A global financial services firm.'),
  ('Procter & Gamble', 'Consumer Goods', 'Cincinnati', 'United States', 'https://us.pg.com', '10000+', 'A global consumer-goods company.'),
  ('The Coca-Cola Company', 'Food and Beverage', 'Atlanta', 'United States', 'https://www.coca-colacompany.com', '10000+', 'A global beverage company.'),
  ('PepsiCo', 'Food and Beverage', 'Purchase', 'United States', 'https://www.pepsico.com', '10000+', 'A global food and beverage company.'),
  ('Novartis', 'Pharmaceuticals', 'Basel', 'Switzerland', 'https://www.novartis.com', '10000+', 'A global pharmaceutical company.'),
  ('GSK', 'Pharmaceuticals', 'London', 'United Kingdom', 'https://www.gsk.com', '10000+', 'A global biopharmaceutical company.'),
  ('AstraZeneca', 'Pharmaceuticals', 'Cambridge', 'United Kingdom', 'https://www.astrazeneca.com', '10000+', 'A global biopharmaceutical company.'),
  ('BMW Group', 'Automotive Manufacturing', 'Munich', 'Germany', 'https://www.bmwgroup.com', '10000+', 'A global automotive manufacturer.'),
  ('Volkswagen Group', 'Automotive Manufacturing', 'Wolfsburg', 'Germany', 'https://www.volkswagen-group.com', '10000+', 'A global automotive manufacturer.'),
  ('Sony', 'Electronics', 'Tokyo', 'Japan', 'https://www.sony.com', '10000+', 'A global electronics, entertainment and technology company.'),
  ('LG Electronics', 'Electronics Manufacturing', 'Seoul', 'South Korea', 'https://www.lg.com', '10000+', 'A global consumer electronics and home appliance manufacturer.')
ON CONFLICT (company_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Job roles the catalogue was missing (existing names are left untouched).
-- ---------------------------------------------------------------------------

INSERT INTO job_roles (role_name, role_category, description) VALUES
  ('Senior Software Engineer', 'Technology', 'Designs and leads delivery of software features and mentors other engineers.'),
  ('QA Automation Engineer', 'Technology', 'Builds and maintains automated test suites and release checks.'),
  ('Relationship Manager', 'Finance and Banking', 'Manages a portfolio of banking clients and their credit and deposit needs.'),
  ('Credit Analyst', 'Finance and Banking', 'Assesses loan proposals and the credit risk of borrowers.'),
  ('Business Development Executive', 'Sales and Marketing', 'Finds and grows partnerships and new business opportunities.'),
  ('Key Account Manager', 'Sales and Marketing', 'Owns relationships and targets for major customer accounts.'),
  ('Quality Control Officer', 'Pharmaceuticals and Science', 'Tests materials and products against quality standards.'),
  ('Content Strategist', 'Sales and Marketing', 'Plans and writes content for digital channels and campaigns.')
ON CONFLICT (role_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Benefits and a varied company-benefit distribution
-- ---------------------------------------------------------------------------

INSERT INTO benefits (benefit_name, benefit_category, description) VALUES
  ('Performance Bonus', 'Financial', 'Variable bonus linked to individual and company performance.'),
  ('Festival Bonus', 'Financial', 'Bonus paid around major festivals.'),
  ('Hybrid Work', 'Work Arrangement', 'A mix of office and remote working days.'),
  ('Transport Allowance', 'Financial', 'Allowance or company transport for commuting.'),
  ('Mobile Allowance', 'Financial', 'Monthly allowance for a mobile phone and data.'),
  ('Parental Leave', 'Leave', 'Paid leave for new parents.'),
  ('Life Insurance', 'Health', 'Group life insurance cover.'),
  ('Gratuity', 'Financial', 'End-of-service gratuity after qualifying years.'),
  ('Annual Retreat', 'Culture', 'A yearly team retreat or company outing.')
ON CONFLICT (benefit_name) DO NOTHING;

INSERT INTO company_benefits (company_id, benefit_id, details, eligibility)
SELECT c.company_id, b.benefit_id,
  pg_temp.bulk_pick(CASE b.benefit_name
      WHEN 'Health Insurance' THEN ARRAY['Group health cover including spouse and children', 'Hospitalisation and outpatient cover', 'Health cover with an annual check-up']
      WHEN 'Provident Fund' THEN ARRAY['Matched monthly contribution', '10 percent of basic pay matched by the company', 'Company contribution after confirmation']
      WHEN 'Festival Bonus' THEN ARRAY['Two festival bonuses a year', 'Two bonuses, each equal to one month''s basic pay']
      WHEN 'Performance Bonus' THEN ARRAY['Yearly bonus based on appraisal rating', 'Quarterly incentive for target-based roles', 'Bonus linked to company and team results']
      WHEN 'Flexible Hours' THEN ARRAY['Core hours with flexible start and finish', 'Flexible schedule agreed with the team']
      WHEN 'Hybrid Work' THEN ARRAY['Two remote days a week for eligible teams', 'Office three days a week', 'Hybrid schedule agreed per team']
      WHEN 'Remote Work' THEN ARRAY['Fully remote options for some engineering roles', 'Occasional remote days on request']
      WHEN 'Subsidized Lunch' THEN ARRAY['Subsidised lunch in the office canteen', 'Daily lunch provided on office days']
      WHEN 'Training Budget' THEN ARRAY['Annual budget for courses and certifications', 'Internal academy plus external training support', 'Conference and certification support']
      WHEN 'Transport Allowance' THEN ARRAY['Monthly commuting allowance', 'Office transport on major routes']
      WHEN 'Mobile Allowance' THEN ARRAY['Monthly phone and data allowance', 'Company SIM with a data package']
      WHEN 'Parental Leave' THEN ARRAY['Paid maternity and paternity leave', 'Extended maternity leave with paid paternity days']
      WHEN 'Life Insurance' THEN ARRAY['Group life cover for all permanent staff', 'Life cover at a multiple of annual salary']
      WHEN 'Gratuity' THEN ARRAY['Gratuity after five years of service', 'Gratuity scheme for permanent employees']
      WHEN 'Annual Retreat' THEN ARRAY['A yearly company retreat', 'Annual team outing and family day']
      ELSE ARRAY['Available to eligible employees'] END,
    'benefit-detail:' || c.company_name || ':' || b.benefit_name),
  pg_temp.bulk_pick(ARRAY['All permanent employees', 'After probation', 'Full-time staff', 'After one year of service', 'Confirmed employees'],
    'benefit-eligibility:' || c.company_name || ':' || b.benefit_name)
FROM companies c
CROSS JOIN benefits b
WHERE pg_temp.bulk_rand('benefit:' || c.company_name || ':' || b.benefit_name) < CASE
    WHEN b.benefit_name IN ('Festival Bonus', 'Gratuity', 'Transport Allowance') AND c.country <> 'Bangladesh' THEN 0
    WHEN b.benefit_name = 'Festival Bonus' THEN 0.75
    WHEN b.benefit_name = 'Health Insurance' THEN 0.62
    WHEN b.benefit_name = 'Provident Fund' THEN CASE WHEN c.country = 'Bangladesh' THEN 0.60 ELSE 0.15 END
    WHEN b.benefit_name = 'Performance Bonus' THEN 0.50
    WHEN b.benefit_name = 'Training Budget' THEN 0.42
    WHEN b.benefit_name IN ('Flexible Hours', 'Hybrid Work') THEN CASE WHEN pg_temp.bulk_category(c.industry) IN ('tech', 'fintech', 'consulting') THEN 0.60 ELSE 0.22 END
    WHEN b.benefit_name = 'Remote Work' THEN CASE WHEN pg_temp.bulk_category(c.industry) IN ('tech', 'fintech') THEN 0.30 ELSE 0.05 END
    WHEN b.benefit_name = 'Parental Leave' THEN 0.40
    WHEN b.benefit_name IN ('Subsidized Lunch', 'Mobile Allowance', 'Life Insurance', 'Gratuity', 'Transport Allowance') THEN 0.30
    WHEN b.benefit_name = 'Annual Retreat' THEN 0.18
    ELSE 0.20 END
ON CONFLICT (company_id, benefit_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Synthetic users: 30 company representatives, 88 contributing employees
--    and 12 job seekers. Fictional names; reserved example.test addresses.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_people ON COMMIT DROP AS
WITH name_lists AS (
  SELECT
    ARRAY['Afsana', 'Afia', 'Anika', 'Ayesha', 'Fahmida', 'Fariha', 'Ishrat', 'Jarin', 'Labiba', 'Maliha', 'Mitu',
          'Nadia', 'Nasrin', 'Nishat', 'Nusrat', 'Priya', 'Ramisa', 'Riya', 'Sadia', 'Samia', 'Shaila', 'Sharmin',
          'Sumaiya', 'Tamanna', 'Tasnim', 'Zarin', 'Arpita', 'Joyita', 'Ananya', 'Rumana', 'Jannat', 'Faiza',
          'Lamia', 'Tahsin', 'Rubaiyat', 'Mehnaz'] AS female,
    ARRAY['Abrar', 'Adnan', 'Ahnaf', 'Arif', 'Farhan', 'Hasib', 'Imran', 'Kamrul', 'Mahir', 'Mehedi', 'Nabil', 'Nafis',
          'Nazmul', 'Omar', 'Parvez', 'Rafi', 'Rakib', 'Rashed', 'Sabbir', 'Saif', 'Shafiq', 'Shams', 'Shuvo',
          'Tahmid', 'Tanvir', 'Towhid', 'Zubair', 'Debashis', 'Pritom', 'Sourav', 'Mahmud', 'Rezwan', 'Muntasir',
          'Ehsan', 'Wasif', 'Tawsif'] AS male,
    ARRAY['Ahmed', 'Alam', 'Ali', 'Amin', 'Anwar', 'Arefin', 'Bhuiyan', 'Chowdhury', 'Das', 'Dey', 'Faruque',
          'Ferdous', 'Haque', 'Hasan', 'Hossain', 'Huda', 'Islam', 'Kabir', 'Karim', 'Khan', 'Mahmud', 'Majumder',
          'Mondal', 'Mostafa', 'Paul', 'Rahman', 'Rashid', 'Roy', 'Saha', 'Sarker', 'Siddique', 'Talukder',
          'Uddin', 'Zaman', 'Barua'] AS surname,
    ARRAY['Akter', 'Sultana', 'Nahar', 'Jahan'] AS female_surname
),
people AS (
  SELECT i AS idx,
    CASE WHEN i <= 30 THEN 'rep' WHEN i <= 118 THEN 'contributor' ELSE 'seeker' END AS grp,
    pg_temp.bulk_rand('gender:' || i) < 0.47 AS is_female,
    n.*
  FROM generate_series(1, 130) AS i CROSS JOIN name_lists n
),
named AS (
  SELECT idx, grp,
    CASE WHEN is_female THEN pg_temp.bulk_pick(female, 'first:' || idx) ELSE pg_temp.bulk_pick(male, 'first:' || idx) END AS first_name,
    CASE WHEN is_female THEN pg_temp.bulk_pick(surname || female_surname, 'last:' || idx) ELSE pg_temp.bulk_pick(surname, 'last:' || idx) END AS last_name
  FROM people
)
SELECT idx, grp, first_name, last_name,
  first_name || ' ' || last_name AS full_name,
  LOWER(first_name || '.' || last_name || '.' || (100 + idx)) || '@example.test' AS email,
  -- Accounts exist before anything they post: contributors joined before
  -- their oldest salary or review, representatives before their jobs.
  CURRENT_TIMESTAMP - ((CASE grp
      WHEN 'contributor' THEN 1060 + FLOOR(pg_temp.bulk_rand('joined:' || idx) * 240)
      WHEN 'rep' THEN 150 + FLOOR(pg_temp.bulk_rand('joined:' || idx) * 700)
      ELSE 130 + FLOOR(pg_temp.bulk_rand('joined:' || idx) * 470) END) || ' days')::INTERVAL
    - ((FLOOR(pg_temp.bulk_rand('joined-hour:' || idx) * 600)) || ' minutes')::INTERVAL AS joined_at,
  NULL::BIGINT AS user_id
FROM named;

INSERT INTO users (full_name, email, password_hash, user_type, account_role, account_status, created_at, updated_at)
SELECT full_name, email, pg_temp.bulk_marker(),
  CASE WHEN grp = 'contributor' THEN 'EMPLOYEE' ELSE 'NORMAL' END,
  CASE WHEN grp = 'rep' THEN 'COMPANY_REPRESENTATIVE' ELSE 'USER' END,
  'ACTIVE', joined_at, joined_at
FROM bulk_people
ON CONFLICT (email) DO NOTHING;

-- Only rows that really are synthetic accounts are used from here on.
UPDATE bulk_people p SET user_id = u.user_id
FROM users u
WHERE u.email = p.email AND u.password_hash = pg_temp.bulk_marker();

-- ---------------------------------------------------------------------------
-- 5. Employee records for the contributors (about a fifth are former staff)
-- ---------------------------------------------------------------------------

INSERT INTO employees (user_id, employment_status, created_at)
SELECT user_id,
  CASE WHEN pg_temp.bulk_rand('former:' || idx) < 0.22 THEN 'FORMER' ELSE 'CURRENT' END,
  joined_at
FROM bulk_people
WHERE grp = 'contributor' AND user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Company representatives: one ACTIVE assignment each, approved by the
--    first active administrator, with the usual request/approval history.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_rep_plan ON COMMIT DROP AS
SELECT p.user_id, p.joined_at, c.company_id, c.company_name, plan.job_title,
  (SELECT user_id FROM users WHERE account_role = 'ADMIN' AND account_status = 'ACTIVE' ORDER BY user_id LIMIT 1) AS admin_id
FROM (VALUES
  (1, 'Brain Station 23', 'Talent Acquisition Lead'), (2, 'BJIT', 'HR Business Partner'),
  (3, 'Enosis Solutions', 'People Operations Manager'), (4, 'Therap (Bangladesh)', 'Recruitment Specialist'),
  (5, 'Cefalo Bangladesh', 'Talent Partner'), (6, 'Tiger IT Bangladesh', 'HR Manager'),
  (7, 'Kaz Software', 'People and Culture Lead'), (8, 'SSL Wireless', 'Senior HR Executive'),
  (9, 'Pathao', 'Talent Acquisition Manager'), (10, 'Chaldal', 'Recruitment Lead'),
  (11, 'ShopUp', 'Talent Partner'), (12, 'Daraz Bangladesh', 'HR Business Partner'),
  (13, 'foodpanda Bangladesh', 'Talent Acquisition Specialist'), (14, 'Paperfly', 'HR Executive'),
  (15, 'Grameenphone', 'Talent Acquisition Manager'), (16, 'Robi Axiata', 'Recruitment Manager'),
  (17, 'Banglalink', 'Talent Acquisition Lead'), (18, 'bKash', 'Talent Acquisition Manager'),
  (19, 'Nagad', 'HR Business Partner'), (20, 'BRAC Bank', 'Recruitment Manager'),
  (21, 'City Bank', 'Senior Officer, Human Resources'), (22, 'Eastern Bank', 'Talent Acquisition Lead'),
  (23, 'Bank Asia', 'HR Manager'), (24, 'Standard Chartered', 'Talent Acquisition Partner'),
  (25, 'Square Pharmaceuticals', 'HR Manager'), (26, 'Eskayef Pharmaceuticals', 'Recruitment Specialist'),
  (27, 'Unilever', 'Talent Acquisition Lead'), (28, 'PRAN-RFL Group', 'HR Manager'),
  (29, 'ACI', 'Talent Acquisition Manager'), (30, 'Walton Hi-Tech Industries', 'HR Executive')
) AS plan(idx, company_name, job_title)
JOIN bulk_people p ON p.idx = plan.idx AND p.grp = 'rep' AND p.user_id IS NOT NULL
JOIN companies c ON c.company_name = plan.company_name;

INSERT INTO company_representatives (user_id, company_id, job_title, assignment_status, request_note,
  decision_note, approved_by, approved_at, created_at, updated_at)
SELECT r.user_id, r.company_id, r.job_title, 'ACTIVE',
  'Requesting access to publish vacancies and review applications for our team.',
  'Assignment confirmed with the company.', r.admin_id,
  r.joined_at + INTERVAL '3 days', r.joined_at + INTERVAL '1 day', r.joined_at + INTERVAL '3 days'
FROM bulk_rep_plan r
WHERE NOT EXISTS (
  SELECT 1 FROM company_representatives existing
  WHERE existing.user_id = r.user_id AND existing.company_id = r.company_id
    AND existing.assignment_status IN ('PENDING', 'ACTIVE')
);

-- Every assignment has its history. This exact note marks the rows this
-- script wrote, so the cleanup script can tell them from real decisions.
INSERT INTO representative_assignment_actions (assignment_id, actor_user_id, action_type,
  previous_status, new_status, action_note, action_at)
SELECT cr.assignment_id, step.actor, step.action_type, step.previous_status, step.new_status,
  'Synthetic academic demo data (bulk script).', step.action_at
FROM bulk_rep_plan r
JOIN company_representatives cr ON cr.user_id = r.user_id AND cr.company_id = r.company_id
  AND cr.assignment_status = 'ACTIVE'
CROSS JOIN LATERAL (VALUES
  (r.user_id, 'REQUEST', NULL, 'PENDING', r.joined_at + INTERVAL '1 day'),
  (r.admin_id, 'APPROVE', 'PENDING', 'ACTIVE', r.joined_at + INTERVAL '3 days')
) AS step(actor, action_type, previous_status, new_status, action_at)
WHERE NOT EXISTS (SELECT 1 FROM representative_assignment_actions a WHERE a.assignment_id = cr.assignment_id);

-- ---------------------------------------------------------------------------
-- 7. Working data: companies, role mix, and what already exists
-- ---------------------------------------------------------------------------

-- Popular employers get more activity than niche ones (a long tail).
CREATE TEMP TABLE bulk_company ON COMMIT DROP AS
SELECT c.company_id, c.company_name, c.country, c.headquarters_city AS city,
  pg_temp.bulk_category(c.industry) AS category,
  COALESCE(w.weight, CASE WHEN c.country = 'Bangladesh' THEN 2.0 ELSE 1.4 END) AS weight,
  0.9 + pg_temp.bulk_rand('pay-level:' || c.company_name) * 0.25 AS pay_factor,
  -- A mild per-company tendency, leaning positive: synthetic data should not
  -- read as a harsh verdict on a real employer.
  pg_temp.bulk_rand('rating-bias:' || c.company_name) * 0.6 - 0.2 AS rating_bias
FROM companies c
LEFT JOIN (VALUES
  ('Brain Station 23', 10.0), ('bKash', 10.0), ('Grameenphone', 10.0), ('BRAC Bank', 9.0),
  ('Square Pharmaceuticals', 8.0), ('BJIT', 7.0), ('Robi Axiata', 7.0), ('Banglalink', 6.0),
  ('Pathao', 6.0), ('Daraz Bangladesh', 6.0), ('Unilever', 6.0), ('Nagad', 6.0), ('City Bank', 6.0),
  ('Eastern Bank', 6.0), ('Enosis Solutions', 5.0), ('Therap (Bangladesh)', 5.0), ('Dutch-Bangla Bank', 5.0),
  ('Walton Hi-Tech Industries', 5.0), ('ACI', 5.0), ('PRAN-RFL Group', 5.0), ('Google', 5.0),
  ('Microsoft', 5.0), ('BRAC', 5.0), ('Chaldal', 4.0), ('ShopUp', 4.0), ('SSL Wireless', 4.0),
  ('Amazon', 4.0), ('Samsung Electronics', 4.0), ('Standard Chartered', 4.0), ('HSBC', 4.0),
  ('Cefalo Bangladesh', 4.0), ('Tiger IT Bangladesh', 4.0), ('Eskayef Pharmaceuticals', 4.0),
  ('Renata', 4.0), ('Incepta Pharmaceuticals', 4.0), ('Beximco Pharmaceuticals', 4.0), ('Bank Asia', 4.0),
  ('Prime Bank', 4.0), ('Islami Bank Bangladesh', 4.0), ('foodpanda Bangladesh', 4.0),
  ('Kaz Software', 3.0), ('REVE Systems', 3.0), ('IFIC Bank', 3.0), ('Mutual Trust Bank', 3.0),
  ('BSRM', 3.0), ('Deloitte', 3.0), ('PwC', 3.0), ('EY', 3.0), ('KPMG', 3.0), ('Accenture', 3.0),
  ('Paperfly', 3.0), ('Aster Byte Limited', 1.0), ('Meghna Analytics', 1.0), ('Northstar Fintech', 1.0),
  ('Green Delta Robotics', 1.0)
) AS w(company_name, weight) ON w.company_name = c.company_name;

-- Which roles each kind of employer hires, and how often.
CREATE TEMP TABLE bulk_category_role ON COMMIT DROP AS
SELECT mix.category, jr.role_id, jr.role_name, jr.role_category, mix.weight,
  pg_temp.bulk_family(jr.role_category, jr.role_name) AS family
FROM (VALUES
  ('tech', 'Software Engineer', 10), ('tech', 'Senior Software Engineer', 6), ('tech', 'Backend Engineer', 6),
  ('tech', 'Frontend Engineer', 5), ('tech', 'Full Stack Engineer', 5), ('tech', 'Mobile Application Developer', 4),
  ('tech', 'Quality Assurance Engineer', 4), ('tech', 'QA Automation Engineer', 3), ('tech', 'DevOps Engineer', 3),
  ('tech', 'Site Reliability Engineer', 2), ('tech', 'Cloud Engineer', 2), ('tech', 'Data Engineer', 3),
  ('tech', 'Data Analyst', 3), ('tech', 'Data Scientist', 2), ('tech', 'Machine Learning Engineer', 2),
  ('tech', 'Product Manager', 3), ('tech', 'UI/UX Designer', 3), ('tech', 'Product Designer', 2),
  ('tech', 'Business Analyst', 3), ('tech', 'Project Manager', 2), ('tech', 'Cybersecurity Analyst', 1),
  ('tech', 'Database Administrator', 1), ('tech', 'Technical Writer', 1), ('tech', 'Talent Acquisition Specialist', 1),
  ('telecom', 'Network Engineer', 8), ('telecom', 'Software Engineer', 4), ('telecom', 'Data Engineer', 3),
  ('telecom', 'Data Analyst', 3), ('telecom', 'Graduate Trainee', 3), ('telecom', 'Management Trainee', 3),
  ('telecom', 'Key Account Manager', 4), ('telecom', 'Sales Executive', 3), ('telecom', 'Digital Marketing Specialist', 3),
  ('telecom', 'Brand Manager', 2), ('telecom', 'Customer Support Specialist', 3), ('telecom', 'Systems Administrator', 2),
  ('telecom', 'Cloud Engineer', 2), ('telecom', 'Financial Analyst', 2), ('telecom', 'Project Manager', 2),
  ('telecom', 'Business Intelligence Analyst', 2),
  ('fintech', 'Software Engineer', 8), ('fintech', 'Backend Engineer', 6), ('fintech', 'Mobile Application Developer', 4),
  ('fintech', 'QA Automation Engineer', 3), ('fintech', 'DevOps Engineer', 3), ('fintech', 'Data Analyst', 4),
  ('fintech', 'Risk Analyst', 3), ('fintech', 'Compliance Officer', 2), ('fintech', 'Product Manager', 3),
  ('fintech', 'Business Development Executive', 3), ('fintech', 'Customer Support Specialist', 3),
  ('fintech', 'UI/UX Designer', 2), ('fintech', 'Cybersecurity Analyst', 2), ('fintech', 'Financial Analyst', 2),
  ('fintech', 'Data Scientist', 1),
  ('bank', 'Relationship Manager', 8), ('bank', 'Banking Officer', 6), ('bank', 'Credit Analyst', 5),
  ('bank', 'Management Trainee', 4), ('bank', 'Risk Analyst', 3), ('bank', 'Compliance Officer', 3),
  ('bank', 'Internal Auditor', 2), ('bank', 'Financial Analyst', 3), ('bank', 'Software Engineer', 3),
  ('bank', 'Data Analyst', 2), ('bank', 'Customer Support Specialist', 2), ('bank', 'Sales Executive', 2),
  ('bank', 'Accountant', 2), ('bank', 'Systems Administrator', 1), ('bank', 'Human Resources Officer', 1),
  ('pharma', 'Medical Promotion Officer', 8), ('pharma', 'Quality Control Officer', 5), ('pharma', 'Pharmacist', 4),
  ('pharma', 'Chemist', 4), ('pharma', 'Production Engineer', 3), ('pharma', 'Laboratory Technologist', 3),
  ('pharma', 'Management Trainee', 3), ('pharma', 'Supply Chain Analyst', 2), ('pharma', 'Brand Manager', 2),
  ('pharma', 'Sales Executive', 2), ('pharma', 'Research Associate', 2), ('pharma', 'Accountant', 1),
  ('pharma', 'Human Resources Officer', 1),
  ('fmcg', 'Management Trainee', 6), ('fmcg', 'Sales Executive', 6), ('fmcg', 'Brand Manager', 4),
  ('fmcg', 'Key Account Manager', 4), ('fmcg', 'Supply Chain Analyst', 4), ('fmcg', 'Marketing Executive', 3),
  ('fmcg', 'Digital Marketing Specialist', 2), ('fmcg', 'Production Engineer', 2), ('fmcg', 'Procurement Officer', 2),
  ('fmcg', 'Financial Analyst', 2), ('fmcg', 'Human Resources Officer', 2), ('fmcg', 'Logistics Coordinator', 2),
  ('fmcg', 'Data Analyst', 2), ('fmcg', 'Content Strategist', 1),
  ('industrial', 'Mechanical Engineer', 6), ('industrial', 'Electrical Engineer', 6), ('industrial', 'Production Engineer', 5),
  ('industrial', 'Industrial Engineer', 3), ('industrial', 'Quality Control Officer', 3), ('industrial', 'Procurement Officer', 3),
  ('industrial', 'Supply Chain Analyst', 3), ('industrial', 'Software Engineer', 2), ('industrial', 'Sales Executive', 2),
  ('industrial', 'Management Trainee', 2), ('industrial', 'Civil Engineer', 2), ('industrial', 'Project Manager', 2),
  ('industrial', 'Accountant', 1), ('industrial', 'Data Analyst', 1),
  ('textile', 'Apparel Merchandiser', 7), ('textile', 'Textile Engineer', 6), ('textile', 'Industrial Engineer', 5),
  ('textile', 'Production Engineer', 3), ('textile', 'Quality Control Officer', 3), ('textile', 'Supply Chain Analyst', 3),
  ('textile', 'Human Resources Officer', 2), ('textile', 'Accountant', 2), ('textile', 'Procurement Officer', 2),
  ('textile', 'Management Trainee', 2),
  ('commerce', 'Operations Manager', 4), ('commerce', 'Logistics Coordinator', 5), ('commerce', 'Software Engineer', 5),
  ('commerce', 'Backend Engineer', 3), ('commerce', 'Data Analyst', 4), ('commerce', 'Customer Support Specialist', 5),
  ('commerce', 'Business Development Executive', 4), ('commerce', 'Digital Marketing Specialist', 3),
  ('commerce', 'Product Manager', 2), ('commerce', 'Mobile Application Developer', 2), ('commerce', 'Supply Chain Analyst', 2),
  ('commerce', 'UI/UX Designer', 2), ('commerce', 'Key Account Manager', 2), ('commerce', 'Content Strategist', 1),
  ('conglomerate', 'Management Trainee', 5), ('conglomerate', 'Sales Executive', 4), ('conglomerate', 'Accountant', 3),
  ('conglomerate', 'Financial Analyst', 3), ('conglomerate', 'Supply Chain Analyst', 3), ('conglomerate', 'Procurement Officer', 3),
  ('conglomerate', 'Human Resources Officer', 3), ('conglomerate', 'Brand Manager', 2), ('conglomerate', 'Production Engineer', 2),
  ('conglomerate', 'Mechanical Engineer', 2), ('conglomerate', 'Electrical Engineer', 2), ('conglomerate', 'Software Engineer', 2),
  ('conglomerate', 'Internal Auditor', 2), ('conglomerate', 'Business Development Executive', 2),
  ('conglomerate', 'Marketing Executive', 2),
  ('consulting', 'Business Analyst', 6), ('consulting', 'Research Associate', 3), ('consulting', 'Data Analyst', 4),
  ('consulting', 'Financial Analyst', 3), ('consulting', 'Project Manager', 3), ('consulting', 'Internal Auditor', 3),
  ('consulting', 'Software Engineer', 3), ('consulting', 'Data Scientist', 2), ('consulting', 'Content Strategist', 2),
  ('consulting', 'Management Trainee', 2), ('consulting', 'Risk Analyst', 2),
  ('development', 'Research Associate', 6), ('development', 'Project Manager', 5), ('development', 'Data Analyst', 4),
  ('development', 'Accountant', 3), ('development', 'Human Resources Officer', 2), ('development', 'Business Analyst', 2),
  ('development', 'Compliance Officer', 2), ('development', 'Data Scientist', 1), ('development', 'Logistics Coordinator', 2),
  ('development', 'Content Strategist', 2), ('development', 'Banking Officer', 2)
) AS mix(category, role_name, weight)
JOIN job_roles jr ON jr.role_name = mix.role_name;

-- Activity sections below run only if this script has not added them before.
CREATE TEMP TABLE bulk_state ON COMMIT DROP AS
SELECT
  EXISTS (SELECT 1 FROM submissions s JOIN users u ON u.user_id = s.user_id
          WHERE u.password_hash = pg_temp.bulk_marker()) AS has_contributions,
  EXISTS (SELECT 1 FROM job_postings j JOIN users u ON u.user_id = j.created_by_user_id
          WHERE u.password_hash = pg_temp.bulk_marker()) AS has_jobs,
  EXISTS (SELECT 1 FROM job_applications a JOIN users u ON u.user_id = a.applicant_user_id
          WHERE u.password_hash = pg_temp.bulk_marker()) AS has_applications;

-- ---------------------------------------------------------------------------
-- 8. Employment scopes. Every contributor has one main employer, often a
--    popular company-role pair so those pairs get several observations, and
--    some have one or two earlier employers from the long tail.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_contributor ON COMMIT DROP AS
SELECT p.idx, p.user_id, p.first_name, p.last_name, p.joined_at, e.employee_id, e.employment_status,
  ROUND((0.4 + 13.5 * POWER(pg_temp.bulk_rand('career:' || p.idx), 1.35))::NUMERIC, 1) AS career_years,
  ROW_NUMBER() OVER (ORDER BY pg_temp.bulk_rand('hot-order:' || p.idx)) AS hot_slot
FROM bulk_people p
JOIN employees e ON e.user_id = p.user_id
WHERE p.grp = 'contributor';

CREATE TEMP TABLE bulk_scope ON COMMIT DROP AS
WITH hot_pairs AS (
  SELECT ord, company_name, role_name FROM (VALUES
    (1, 'Brain Station 23', 'Software Engineer'), (2, 'bKash', 'Software Engineer'), (3, 'Grameenphone', 'Network Engineer'),
    (4, 'BRAC Bank', 'Relationship Manager'), (5, 'Square Pharmaceuticals', 'Medical Promotion Officer'),
    (6, 'BJIT', 'Software Engineer'), (7, 'Robi Axiata', 'Network Engineer'), (8, 'City Bank', 'Relationship Manager'),
    (9, 'Pathao', 'Software Engineer'), (10, 'Unilever', 'Management Trainee'), (11, 'Brain Station 23', 'Quality Assurance Engineer'),
    (12, 'bKash', 'Backend Engineer'), (13, 'Enosis Solutions', 'Software Engineer'), (14, 'Therap (Bangladesh)', 'Software Engineer'),
    (15, 'Daraz Bangladesh', 'Data Analyst'), (16, 'Eastern Bank', 'Credit Analyst'), (17, 'Banglalink', 'Network Engineer'),
    (18, 'Nagad', 'Software Engineer'), (19, 'Grameenphone', 'Management Trainee'), (20, 'Google', 'Software Engineer'),
    (21, 'Microsoft', 'Software Engineer'), (22, 'Walton Hi-Tech Industries', 'Electrical Engineer'),
    (23, 'ACI', 'Sales Executive'), (24, 'PRAN-RFL Group', 'Management Trainee'), (25, 'Dutch-Bangla Bank', 'Banking Officer'),
    (26, 'Square Pharmaceuticals', 'Quality Control Officer'), (27, 'Cefalo Bangladesh', 'Software Engineer'),
    (28, 'Tiger IT Bangladesh', 'Software Engineer'), (29, 'Samsung Electronics', 'Software Engineer'),
    (30, 'Standard Chartered', 'Relationship Manager')
  ) AS pairs(ord, company_name, role_name)
),
main_scope AS (
  -- Three contributors per popular pair, spread in a shuffled order.
  SELECT bc.idx, bc.user_id, bc.employee_id, bc.first_name, bc.last_name, bc.joined_at, bc.employment_status, bc.career_years,
    1 AS scope_no, c.company_id, c.company_name, c.country, c.city, c.category, c.weight, c.pay_factor,
    cr.role_id, cr.role_name, cr.role_category, cr.family
  FROM bulk_contributor bc
  JOIN hot_pairs hp ON hp.ord = 1 + ((bc.hot_slot - 1) % 30)
  JOIN bulk_company c ON c.company_name = hp.company_name
  JOIN LATERAL (SELECT role_id, role_name, role_category, family FROM bulk_category_role
                WHERE role_name = hp.role_name LIMIT 1) cr ON TRUE
),
extra_scope AS (
  SELECT bc.idx, bc.user_id, bc.employee_id, bc.first_name, bc.last_name, bc.joined_at, bc.employment_status, bc.career_years,
    1 + k AS scope_no, co.company_id, co.company_name, co.country, co.city, co.category, co.weight, co.pay_factor,
    ro.role_id, ro.role_name, ro.role_category, ro.family
  FROM bulk_contributor bc
  CROSS JOIN generate_series(1, 2) AS k
  CROSS JOIN LATERAL (
    SELECT * FROM bulk_company
    ORDER BY -LN(1 - pg_temp.bulk_rand('extra-company:' || bc.idx || ':' || k || ':' || company_name)) / weight
    LIMIT 1
  ) co
  CROSS JOIN LATERAL (
    SELECT * FROM bulk_category_role r
    WHERE r.category = co.category
    ORDER BY -LN(1 - pg_temp.bulk_rand('extra-role:' || bc.idx || ':' || k || ':' || r.role_name)) / r.weight
    LIMIT 1
  ) ro
  WHERE bc.career_years >= 2.0
    AND pg_temp.bulk_rand('extra-count:' || bc.idx || ':' || k) < CASE k WHEN 1 THEN 0.75 ELSE 0.45 END
),
all_scopes AS (
  SELECT DISTINCT ON (user_id, company_id, role_id) *
  FROM (SELECT * FROM main_scope UNION ALL SELECT * FROM extra_scope) combined
  ORDER BY user_id, company_id, role_id, scope_no
),
timeline AS (
  -- Main employer is current (unless the person is a former employee);
  -- earlier employers end before it starts. Days are counted back from now.
  SELECT s.*,
    ROUND(LEAST(s.career_years * 365, CASE WHEN s.scope_no = 1 THEN 200 + pg_temp.bulk_rand('tenure:' || s.idx || ':' || s.scope_no) * 800
                                                  ELSE 220 + pg_temp.bulk_rand('tenure:' || s.idx || ':' || s.scope_no) * 950 END)) AS tenure_days
  FROM all_scopes s
)
SELECT t.*,
  t.idx || ':' || t.company_name || ':' || t.role_name AS scope_key,
  CASE WHEN t.scope_no = 1 AND t.employment_status = 'CURRENT' THEN 0
       WHEN t.scope_no = 1 THEN ROUND(30 + pg_temp.bulk_rand('left:' || t.idx) * 330)
       ELSE NULL END AS end_days_ago
FROM timeline t;

-- Earlier employers are laid out back to back before the main one.
UPDATE bulk_scope s SET end_days_ago = prior.end_days_ago
FROM (
  SELECT s2.user_id, s2.scope_no,
    main.end_days_ago + main.tenure_days
      + SUM(s2.tenure_days) OVER (PARTITION BY s2.user_id ORDER BY s2.scope_no) - s2.tenure_days
      + 20 * (s2.scope_no - 1) AS end_days_ago
  FROM bulk_scope s2
  JOIN bulk_scope main ON main.user_id = s2.user_id AND main.scope_no = 1
  WHERE s2.scope_no > 1
) prior
WHERE s.user_id = prior.user_id AND s.scope_no = prior.scope_no;

-- Verification outcome for each scope: most are verified, some expired after
-- the person left, some pending or rejected, and some never requested.
ALTER TABLE bulk_scope ADD COLUMN verification TEXT;
-- (A scope whose main employer is missing from this database has no
-- timeline, so it is skipped wherever dates are needed.)
UPDATE bulk_scope SET verification = CASE
  WHEN pg_temp.bulk_rand('verify:' || scope_key) < 0.58
    THEN CASE WHEN end_days_ago > 0 AND scope_no > 1 THEN 'EXPIRED' ELSE 'VERIFIED' END
  WHEN pg_temp.bulk_rand('verify:' || scope_key) < 0.68
    THEN CASE WHEN end_days_ago > 0 THEN 'EXPIRED' ELSE 'VERIFIED' END
  WHEN pg_temp.bulk_rand('verify:' || scope_key) < 0.78 THEN 'PENDING'
  WHEN pg_temp.bulk_rand('verify:' || scope_key) < 0.83 THEN 'REJECTED'
  ELSE 'NONE' END;

INSERT INTO employment_verifications (employee_id, company_id, role_id, verification_method, company_email,
  proof_type, proof_reference, verification_status, requested_at, reviewed_at, expires_at, rejection_reason, reviewed_by)
SELECT s.employee_id, s.company_id, s.role_id,
  CASE WHEN email_route THEN 'COMPANY_EMAIL_OTP' ELSE 'DOCUMENT' END,
  CASE WHEN email_route THEN LOWER(s.first_name || '.' || s.last_name || '.' || s.idx) || '@'
    || TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(s.company_name), '[^a-z0-9]+', '-', 'g')) || '.example' END,
  CASE WHEN email_route THEN NULL ELSE pg_temp.bulk_pick(ARRAY['EMPLOYMENT_LETTER', 'PAYSLIP', 'EMPLOYEE_ID_CARD', 'EXPERIENCE_CERTIFICATE'],
    'proof:' || s.scope_key) END,
  CASE WHEN email_route THEN NULL ELSE 'demo://proof/bulk-' || SUBSTR(MD5(s.scope_key), 1, 12) END,
  s.verification,
  requested,
  CASE WHEN s.verification = 'PENDING' THEN NULL ELSE requested + ((1 + FLOOR(pg_temp.bulk_rand('reviewed:' || s.scope_key) * 6)) || ' days')::INTERVAL END,
  CASE WHEN s.verification = 'VERIFIED' THEN CURRENT_TIMESTAMP + ((120 + FLOOR(pg_temp.bulk_rand('expires:' || s.scope_key) * 480)) || ' days')::INTERVAL
       WHEN s.verification = 'EXPIRED' THEN LEAST(CURRENT_TIMESTAMP - INTERVAL '1 day', requested + INTERVAL '365 days') END,
  CASE WHEN s.verification = 'REJECTED' THEN pg_temp.bulk_pick(ARRAY[
      'The document did not show the job title for this role.',
      'The company email could not be confirmed.',
      'The proof was older than the allowed period.'], 'rejected:' || s.scope_key) END,
  CASE WHEN s.verification = 'PENDING' THEN NULL ELSE COALESCE(rep.user_id, rep.admin_id,
    (SELECT user_id FROM users WHERE account_role = 'ADMIN' AND account_status = 'ACTIVE' ORDER BY user_id LIMIT 1)) END
FROM (
  SELECT s.*,
    pg_temp.bulk_rand('route:' || s.scope_key) < 0.55 AS email_route,
    CASE WHEN s.verification = 'PENDING'
      THEN CURRENT_TIMESTAMP - ((1 + FLOOR(pg_temp.bulk_rand('requested:' || s.scope_key) * 12)) || ' days')::INTERVAL
      -- Some weeks into the job, and never before the account existed.
      ELSE GREATEST(s.joined_at + INTERVAL '1 day',
        CURRENT_TIMESTAMP - (((s.end_days_ago + s.tenure_days) - LEAST(s.tenure_days - 10, 25 + FLOOR(pg_temp.bulk_rand('requested:' || s.scope_key) * 90))) || ' days')::INTERVAL)
    END AS requested
  FROM bulk_scope s
) s
LEFT JOIN bulk_rep_plan rep ON rep.company_id = s.company_id
WHERE s.verification <> 'NONE' AND s.end_days_ago IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employment_verifications v
    WHERE v.employee_id = s.employee_id AND v.company_id = s.company_id AND v.role_id = s.role_id
  );

-- ---------------------------------------------------------------------------
-- 9. Salary submissions. Several observations per popular company-role
--    pair; pay depends on country, employer type, role, seniority, contract
--    and year. Recent years dominate.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_salary_plan ON COMMIT DROP AS
WITH observations AS (
  SELECT s.*, n,
    -- How long ago this salary was reported, inside the time at this employer.
    s.end_days_ago + FLOOR(LEAST(s.tenure_days, 1050 - s.end_days_ago)
      * POWER(pg_temp.bulk_rand('salary-when:' || s.scope_key || ':' || n), 1.5)) + 2 AS days_ago,
    pg_temp.bulk_rand('salary-noise:' || s.scope_key || ':' || n) AS noise
  FROM bulk_scope s
  CROSS JOIN generate_series(1, 7) AS n
  WHERE s.end_days_ago < 1000
    AND n <= CASE WHEN s.scope_no = 1
                  THEN 3 + FLOOR(pg_temp.bulk_rand('salary-count:' || s.idx) * 4) + CASE WHEN s.weight >= 8 THEN 1 ELSE 0 END
                  ELSE 1 + FLOOR(pg_temp.bulk_rand('salary-count:' || s.idx || ':' || s.scope_no) * 3) END
),
shaped AS (
  SELECT o.*,
    CASE WHEN o.role_category = 'Early Career' THEN LEAST(1.5, GREATEST(0, o.career_years - (o.days_ago / 365.0)))
         WHEN o.role_name = 'Senior Software Engineer' THEN GREATEST(5, o.career_years - (o.days_ago / 365.0))
         ELSE GREATEST(0, o.career_years - (o.days_ago / 365.0)) END AS years,
    pg_temp.bulk_rand('contract:' || o.scope_key || ':' || o.n) AS contract_roll
  FROM observations o
)
SELECT NEXTVAL(pg_get_serial_sequence('submissions', 'submission_id')) AS sid, x.*,
  x.scope_key || ':salary:' || x.n AS row_key,
  GREATEST(x.unit, ROUND((GREATEST(x.pay_estimate, pg_temp.bulk_mid(x.country) * 0.14) / x.unit)::NUMERIC) * x.unit) AS base_salary
FROM (
  SELECT sh.*,
    CURRENT_TIMESTAMP - (sh.days_ago || ' days')::INTERVAL
      - ((FLOOR(pg_temp.bulk_rand('salary-hour:' || sh.scope_key || ':' || sh.n) * 720)) || ' minutes')::INTERVAL AS submitted_at,
    CASE WHEN sh.years < 0.8 AND sh.role_category <> 'Early Career' AND sh.contract_roll < 0.5 THEN 'INTERN'
         WHEN sh.contract_roll > 0.95 THEN 'CONTRACT'
         WHEN sh.contract_roll > 0.925 THEN 'PART_TIME'
         ELSE 'FULL_TIME' END AS employment_type,
    pg_temp.bulk_unit(sh.country) AS unit,
    pg_temp.bulk_mid(sh.country) * pg_temp.bulk_category_factor(sh.category)
      * pg_temp.bulk_role_factor(sh.role_category, sh.role_name)
      * pg_temp.bulk_level_factor(ROUND(sh.years::NUMERIC, 1), sh.role_category,
          sh.years < 0.8 AND sh.role_category <> 'Early Career' AND sh.contract_roll < 0.5)
      * sh.pay_factor * (0.86 + 0.28 * sh.noise)
      * CASE WHEN sh.contract_roll > 0.925 AND sh.contract_roll <= 0.95 THEN 0.55 ELSE 1 END AS pay_estimate
  FROM shaped sh
) x
WHERE NOT (SELECT has_contributions FROM bulk_state);

INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous,
  submission_status, verification_status, submitted_at, approved_at, updated_at)
SELECT sid, user_id, company_id, 'SALARY',
  CASE WHEN pg_temp.bulk_rand('anonymous:' || row_key) < 0.72 THEN 1 ELSE 0 END,
  status,
  CASE WHEN verification IN ('VERIFIED', 'EXPIRED') THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
  submitted_at,
  CASE WHEN status = 'APPROVED' THEN approved END,
  COALESCE(CASE WHEN status = 'APPROVED' THEN approved END, submitted_at)
FROM (
  SELECT p.*,
    CASE WHEN r < 0.90 THEN 'APPROVED' WHEN r < 0.95 THEN 'PENDING' WHEN r < 0.98 THEN 'REJECTED' ELSE 'FLAGGED' END AS status,
    LEAST(submitted_at + ((6 + FLOOR(pg_temp.bulk_rand('approved:' || row_key) * 200)) || ' hours')::INTERVAL,
          CURRENT_TIMESTAMP - INTERVAL '30 minutes') AS approved
  FROM (SELECT bsp.*, pg_temp.bulk_rand('moderation:' || bsp.row_key) AS r FROM bulk_salary_plan bsp) p
) planned;

INSERT INTO salary_submissions (submission_id, role_id, base_salary, additional_compensation, currency,
  pay_period, years_of_experience, employment_type, work_mode, salary_year)
SELECT sid, role_id, base_salary,
  CASE WHEN pg_temp.bulk_rand('bonus:' || row_key) < 0.52 THEN NULL
       ELSE NULLIF(ROUND(base_salary * (0.04 + pg_temp.bulk_rand('bonus-size:' || row_key) * 0.21) / unit) * unit, 0) END,
  pg_temp.bulk_currency(country),
  CASE WHEN country = 'Bangladesh' THEN 'MONTHLY' ELSE 'YEARLY' END,
  LEAST(60, ROUND(years::NUMERIC, 1)),
  employment_type,
  CASE WHEN category IN ('tech', 'fintech', 'consulting')
       THEN pg_temp.bulk_pick(ARRAY['ONSITE', 'ONSITE', 'ONSITE', 'HYBRID', 'HYBRID', 'HYBRID', 'REMOTE'], 'mode:' || row_key)
       ELSE pg_temp.bulk_pick(ARRAY['ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'HYBRID', 'HYBRID', 'REMOTE'], 'mode:' || row_key) END,
  EXTRACT(YEAR FROM submitted_at)::INT
FROM bulk_salary_plan;

-- ---------------------------------------------------------------------------
-- 10. Company reviews: varied ratings (a per-company tendency plus
--     individual spread), natural titles and pros/cons.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_review_text ON COMMIT DROP AS
SELECT
  ARRAY['A place where you can grow quickly', 'Supportive team and real ownership', 'Best job I have had so far',
        'Great mentors and meaningful work', 'Learning never stops here', 'Fair, well-run and friendly',
        'Strong culture with clear goals', 'Good pay and genuinely kind colleagues',
        'Solid employer for early-career professionals', 'Happy to have spent my years here'] AS title_high,
  ARRAY['Good overall, with room to improve', 'Solid place to build experience', 'Decent balance of learning and stability',
        'Positive experience with a few gaps', 'Good team, slow processes', 'Worth it for the exposure',
        'Reliable employer with average pay growth', 'Good first job with clear structure',
        'Interesting projects, busy seasons', 'Stable and professional'] AS title_good,
  ARRAY['Mixed experience overall', 'Good people, unclear direction', 'Okay for a start, hard to grow',
        'Depends heavily on your team', 'Average pay and a heavy workload', 'Some good, some frustrating',
        'Structure is fine, growth is slow', 'Fine for a year or two'] AS title_mixed,
  ARRAY['Not the right fit for me', 'Struggled with workload and support', 'Growth opportunities were limited',
        'Management communication needs work', 'Hard to recommend right now', 'Expectations did not match the role'] AS title_low,
  ARRAY['Colleagues are helpful and share knowledge freely', 'Salary is paid on time and bonuses are predictable',
        'Clear processes make it easy to know what is expected', 'Managers give honest feedback in regular one-to-ones',
        'Good exposure to senior leadership early on', 'Training sessions are frequent and useful',
        'The office is well located and comfortable', 'Health insurance covers family members',
        'Leave requests are approved without fuss', 'You get responsibility quickly if you ask for it',
        'Internal transfers between teams are possible', 'A strong brand name that helps your CV',
        'Performance reviews follow a transparent rubric', 'The team celebrates wins and supports each other',
        'Good job security compared with the market', 'Provident fund and gratuity are handled properly',
        'Onboarding was well organised', 'Flexible start times on most days', 'Plenty of cross-functional exposure',
        'A friendly, low-politics atmosphere in most teams'] AS pros_general,
  ARRAY['Code reviews are thorough and teach you a lot', 'A modern stack with room to experiment',
        'Engineers own features from design to release', 'A good CI/CD pipeline and testing culture',
        'You work on systems used by a very large number of people', 'Senior engineers are approachable mentors',
        'Hybrid work is genuinely supported', 'Time is set aside to reduce technical debt'] AS pros_tech,
  ARRAY['A structured career path with clear grades', 'Good exposure to corporate clients',
        'Staff loan facilities are genuinely useful', 'Well-designed compliance training'] AS pros_bank,
  ARRAY['Hands-on exposure to large-scale production', 'Safety standards are taken seriously',
        'Good technical training on new machinery', 'You learn how an entire supply chain works'] AS pros_industrial,
  ARRAY['Field allowances and incentives are fair', 'Excellent sales and marketing training',
        'A strong brand portfolio to work with', 'Clear targets and quick recognition when you hit them'] AS pros_field,
  ARRAY['Promotion cycles are slow and rely on tenure', 'Workload spikes near quarter end',
        'Too many meetings for routine decisions', 'Decision-making is quite hierarchical',
        'Salary increments do not always keep up with the market', 'Some internal tools are outdated',
        'Remote work options are limited', 'Cross-team communication could be clearer',
        'Long approval chains slow projects down', 'The commute can be tiring', 'Documentation is scattered',
        'Priorities change without much explanation', 'Limited budget for external courses',
        'Onboarding for later joiners was less structured', 'Recognition depends a lot on your manager',
        'Weekend work happens during launches', 'Career paths outside management are unclear',
        'The bonus structure is hard to understand'] AS cons_general,
  ARRAY['Release cycles can be long for a product company', 'Legacy modules are painful to change',
        'On-call rotations can be tiring', 'Shared test environments are often unstable',
        'Estimates are sometimes set before engineers are consulted'] AS cons_tech,
  ARRAY['Sales targets can feel aggressive', 'Frequent travel between districts',
        'Long days in the field during campaigns'] AS cons_field,
  ARRAY['Shift schedules can be demanding', 'The factory is far from the city',
        'Paperwork for small changes takes time'] AS cons_industrial,
  ARRAY['Share the reasoning behind priority changes with the wider team.', 'Review salary bands against the market every year.',
        'Give employees a clearer path to promotion.', 'Invest more in modern internal tools.',
        'Reduce the number of approval layers for small decisions.', 'Keep the mentoring programme; it works.',
        'Offer more flexibility on hybrid days.', 'Recognise quieter contributors, not only the most visible ones.',
        'Plan workload peaks earlier so teams can prepare.', 'Make performance criteria more transparent.',
        'Create technical career tracks alongside management tracks.', 'Listen to exit feedback and act on it.',
        'Fund external certifications for high performers.',
        'Keep communicating as openly as during the last reorganisation.'] AS advice;

CREATE TEMP TABLE bulk_review_plan ON COMMIT DROP AS
WITH moments AS (
  -- Some reviews are written after leaving (a former employee's view).
  SELECT s.*, n,
    s.end_days_ago > 0 AND pg_temp.bulk_rand('review-after:' || s.scope_key || ':' || n) < 0.6 AS after_leaving,
    pg_temp.bulk_rand('review-when:' || s.scope_key || ':' || n) AS when_roll,
    pg_temp.bulk_rand('review-rating:' || s.scope_key || ':' || n) AS rating_roll
  FROM bulk_scope s
  CROSS JOIN generate_series(1, 2) AS n
  WHERE s.end_days_ago < 1050
    AND (n = 1 OR pg_temp.bulk_rand('review-second:' || s.scope_key) < 0.8)
),
planned AS (
  SELECT m.*,
    LEAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - m.joined_at)) / 86400 - 2,
      CASE WHEN m.after_leaving THEN 3 + FLOOR(m.end_days_ago * POWER(m.when_roll, 1.3))
           ELSE m.end_days_ago + FLOOR(LEAST(m.tenure_days, 1100 - m.end_days_ago) * POWER(m.when_roll, 1.3)) + 3 END)::INT AS days_ago
  FROM moments m
),
rated AS (
  SELECT p.*, c.rating_bias,
    LEAST(5, GREATEST(1, ROUND((CASE
      WHEN p.rating_roll < 0.04 THEN 1.5 WHEN p.rating_roll < 0.09 THEN 2.0 WHEN p.rating_roll < 0.20 THEN 2.5
      WHEN p.rating_roll < 0.37 THEN 3.0 WHEN p.rating_roll < 0.62 THEN 3.5 WHEN p.rating_roll < 0.86 THEN 4.0
      WHEN p.rating_roll < 0.96 THEN 4.5 ELSE 5.0 END + c.rating_bias) * 2) / 2)) AS overall
  FROM planned p
  JOIN bulk_company c ON c.company_id = p.company_id
)
SELECT NEXTVAL(pg_get_serial_sequence('submissions', 'submission_id')) AS sid, r.*,
  r.scope_key || ':review:' || r.n AS row_key,
  CURRENT_TIMESTAMP - (r.days_ago || ' days')::INTERVAL
    - ((FLOOR(pg_temp.bulk_rand('review-hour:' || r.scope_key || ':' || r.n) * 720)) || ' minutes')::INTERVAL AS submitted_at
FROM rated r
WHERE NOT (SELECT has_contributions FROM bulk_state);

INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous,
  submission_status, verification_status, submitted_at, approved_at, updated_at)
SELECT sid, user_id, company_id, 'REVIEW',
  CASE WHEN pg_temp.bulk_rand('anonymous:' || row_key) < 0.78 THEN 1 ELSE 0 END,
  status,
  CASE WHEN verification IN ('VERIFIED', 'EXPIRED') THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
  submitted_at,
  CASE WHEN status = 'APPROVED' THEN approved END,
  COALESCE(CASE WHEN status = 'APPROVED' THEN approved END, submitted_at)
FROM (
  SELECT p.*,
    CASE WHEN r < 0.90 THEN 'APPROVED' WHEN r < 0.95 THEN 'PENDING' WHEN r < 0.98 THEN 'REJECTED' ELSE 'FLAGGED' END AS status,
    LEAST(submitted_at + ((6 + FLOOR(pg_temp.bulk_rand('approved:' || row_key) * 200)) || ' hours')::INTERVAL,
          CURRENT_TIMESTAMP - INTERVAL '30 minutes') AS approved
  FROM (SELECT brp.*, pg_temp.bulk_rand('moderation:' || brp.row_key) AS r FROM bulk_review_plan brp) p
) planned;

INSERT INTO company_reviews (submission_id, role_id, review_title, overall_rating, work_life_balance_rating,
  career_growth_rating, management_rating, culture_rating, pros, cons, advice_to_management, employment_status, review_date)
SELECT p.sid,
  CASE WHEN pg_temp.bulk_rand('review-role:' || p.row_key) < 0.9 THEN p.role_id END,
  pg_temp.bulk_pick(CASE WHEN p.overall >= 4.5 THEN t.title_high WHEN p.overall >= 3.5 THEN t.title_good
                         WHEN p.overall >= 2.5 THEN t.title_mixed ELSE t.title_low END, 'review-title:' || p.row_key),
  p.overall,
  LEAST(5, GREATEST(1, p.overall + (pg_temp.bulk_pick(ARRAY['-1', '-0.5', '0', '0', '0.5', '0.5'], 'wlb:' || p.row_key))::NUMERIC)),
  LEAST(5, GREATEST(1, p.overall + (pg_temp.bulk_pick(ARRAY['-1', '-0.5', '-0.5', '0', '0', '0.5'], 'growth:' || p.row_key))::NUMERIC)),
  LEAST(5, GREATEST(1, p.overall + (pg_temp.bulk_pick(ARRAY['-1', '-0.5', '0', '0', '0', '0.5'], 'management:' || p.row_key))::NUMERIC)),
  LEAST(5, GREATEST(1, p.overall + (pg_temp.bulk_pick(ARRAY['-0.5', '0', '0', '0.5', '0.5', '1'], 'culture:' || p.row_key))::NUMERIC)),
  pg_temp.bulk_two(t.pros_general || CASE
      WHEN p.category IN ('tech', 'fintech', 'telecom') THEN t.pros_tech
      WHEN p.category = 'bank' THEN t.pros_bank
      WHEN p.category IN ('industrial', 'textile') THEN t.pros_industrial
      WHEN p.category IN ('pharma', 'fmcg') THEN t.pros_field
      ELSE ARRAY[]::TEXT[] END, 'pros:' || p.row_key),
  CASE WHEN p.overall >= 4 AND pg_temp.bulk_rand('cons-count:' || p.row_key) < 0.6
    THEN pg_temp.bulk_pick(t.cons_general || CASE
        WHEN p.category IN ('tech', 'fintech', 'telecom') THEN t.cons_tech
        WHEN p.category IN ('pharma', 'fmcg') THEN t.cons_field
        WHEN p.category IN ('industrial', 'textile') THEN t.cons_industrial
        ELSE ARRAY[]::TEXT[] END, 'cons:' || p.row_key) || '.'
    ELSE pg_temp.bulk_two(t.cons_general || CASE
        WHEN p.category IN ('tech', 'fintech', 'telecom') THEN t.cons_tech
        WHEN p.category IN ('pharma', 'fmcg') THEN t.cons_field
        WHEN p.category IN ('industrial', 'textile') THEN t.cons_industrial
        ELSE ARRAY[]::TEXT[] END, 'cons:' || p.row_key) END,
  CASE WHEN pg_temp.bulk_rand('advice:' || p.row_key) < 0.55 THEN pg_temp.bulk_pick(t.advice, 'advice-text:' || p.row_key) END,
  CASE WHEN p.after_leaving THEN 'FORMER' ELSE 'CURRENT' END,
  p.submitted_at::DATE
FROM bulk_review_plan p
CROSS JOIN bulk_review_text t;

-- ---------------------------------------------------------------------------
-- 11. Interview experiences: candidates from across the synthetic users.
--     Those who got the job and are verified there report an offer.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_interview_plan ON COMMIT DROP AS
WITH events AS (
  SELECT e AS event_no FROM generate_series(1, 250) AS e
),
picked AS (
  SELECT ev.event_no, co.company_id, co.company_name, co.category, ro.role_id, ro.role_name, ro.role_category, ro.family,
    author.user_id, author.idx, author.joined_at
  FROM events ev
  CROSS JOIN LATERAL (
    SELECT * FROM bulk_company
    ORDER BY -LN(1 - pg_temp.bulk_rand('interview-company:' || ev.event_no || ':' || company_name)) / weight
    LIMIT 1
  ) co
  CROSS JOIN LATERAL (
    SELECT * FROM bulk_category_role r
    WHERE r.category = co.category
    ORDER BY -LN(1 - pg_temp.bulk_rand('interview-role:' || ev.event_no || ':' || r.role_name)) / r.weight
    LIMIT 1
  ) ro
  CROSS JOIN LATERAL (
    SELECT p.user_id, p.idx, p.joined_at FROM bulk_people p
    WHERE p.grp IN ('contributor', 'seeker') AND p.user_id IS NOT NULL
    ORDER BY pg_temp.bulk_rand('interview-author:' || ev.event_no || ':' || p.idx)
    LIMIT 1
  ) author
),
shaped AS (
  SELECT p.*,
    EXISTS (SELECT 1 FROM bulk_scope s WHERE s.user_id = p.user_id AND s.company_id = p.company_id
            AND s.role_id = p.role_id AND s.verification IN ('VERIFIED', 'EXPIRED')) AS verified_hire,
    CASE WHEN p.role_category = 'Early Career' OR pg_temp.bulk_rand('interview-level:' || p.event_no) < 0.32 THEN 'junior'
         WHEN pg_temp.bulk_rand('interview-level:' || p.event_no) < 0.80 THEN 'standard' ELSE 'senior' END AS band,
    LEAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.joined_at)) / 86400 - 2,
      CASE WHEN pg_temp.bulk_rand('interview-result:' || p.event_no) BETWEEN 0.66 AND 0.84
           THEN 3 + FLOOR(55 * pg_temp.bulk_rand('interview-when:' || p.event_no))
           ELSE 3 + FLOOR(950 * POWER(pg_temp.bulk_rand('interview-when:' || p.event_no), 1.6)) END)::INT AS days_ago,
    pg_temp.bulk_rand('interview-result:' || p.event_no) AS result_roll,
    pg_temp.bulk_rand('interview-difficulty:' || p.event_no) AS difficulty_roll
  FROM picked p
)
SELECT NEXTVAL(pg_get_serial_sequence('submissions', 'submission_id')) AS sid, sh.*,
  'interview:' || sh.event_no AS row_key,
  CASE sh.band
    WHEN 'junior' THEN 1 + FLOOR(pg_temp.bulk_rand('rounds:' || sh.event_no) * 3)
    WHEN 'standard' THEN 2 + FLOOR(pg_temp.bulk_rand('rounds:' || sh.event_no) * 3)
    ELSE 3 + FLOOR(POWER(pg_temp.bulk_rand('rounds:' || sh.event_no), 1.4) * 4) END::INT AS rounds,
  CASE
    WHEN sh.verified_hire THEN 'OFFERED'
    WHEN sh.result_roll < 0.36 THEN 'REJECTED'
    WHEN sh.result_roll < 0.66 THEN 'OFFERED'
    WHEN sh.result_roll < 0.84 THEN 'PENDING'
    ELSE 'WITHDREW' END AS result_status,
  CASE sh.band
    WHEN 'senior' THEN CASE WHEN sh.difficulty_roll < 0.45 THEN 'HARD' WHEN sh.difficulty_roll < 0.92 THEN 'MEDIUM' ELSE 'EASY' END
    WHEN 'standard' THEN CASE WHEN sh.difficulty_roll < 0.20 THEN 'HARD' WHEN sh.difficulty_roll < 0.80 THEN 'MEDIUM' ELSE 'EASY' END
    ELSE CASE WHEN sh.difficulty_roll < 0.10 THEN 'HARD' WHEN sh.difficulty_roll < 0.63 THEN 'MEDIUM' ELSE 'EASY' END END AS difficulty,
  CURRENT_TIMESTAMP - (sh.days_ago || ' days')::INTERVAL
    - ((FLOOR(pg_temp.bulk_rand('interview-hour:' || sh.event_no) * 720)) || ' minutes')::INTERVAL AS submitted_at,
  CASE WHEN sh.family IN ('tech') THEN 'tech'
       WHEN sh.family = 'data' THEN 'data'
       WHEN sh.family IN ('product', 'design') THEN 'product'
       WHEN sh.family = 'finance' THEN 'finance'
       WHEN sh.family IN ('industrial', 'science') THEN 'industrial'
       ELSE 'business' END AS track
FROM shaped sh
WHERE NOT (SELECT has_contributions FROM bulk_state);

INSERT INTO submissions (submission_id, user_id, company_id, submission_type, is_anonymous,
  submission_status, verification_status, submitted_at, approved_at, updated_at)
SELECT sid, user_id, company_id, 'INTERVIEW',
  CASE WHEN pg_temp.bulk_rand('anonymous:' || row_key) < 0.65 THEN 1 ELSE 0 END,
  status,
  CASE WHEN verified_hire THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
  submitted_at,
  CASE WHEN status = 'APPROVED' THEN approved END,
  COALESCE(CASE WHEN status = 'APPROVED' THEN approved END, submitted_at)
FROM (
  SELECT p.*,
    CASE WHEN r < 0.90 THEN 'APPROVED' WHEN r < 0.96 THEN 'PENDING' ELSE 'REJECTED' END AS status,
    LEAST(submitted_at + ((6 + FLOOR(pg_temp.bulk_rand('approved:' || row_key) * 200)) || ' hours')::INTERVAL,
          CURRENT_TIMESTAMP - INTERVAL '30 minutes') AS approved
  FROM (SELECT bip.*, pg_temp.bulk_rand('moderation:' || bip.row_key) AS r FROM bulk_interview_plan bip) p
) planned;

INSERT INTO interview_experiences (submission_id, role_id, interview_date, difficulty_level, rounds_count,
  interview_mode, result_status, duration_days, process_description, questions_summary)
SELECT p.sid, p.role_id,
  (p.submitted_at - ((1 + FLOOR(pg_temp.bulk_rand('interview-gap:' || p.row_key) * 20)) || ' days')::INTERVAL)::DATE,
  p.difficulty, p.rounds,
  pg_temp.bulk_pick(ARRAY['ONLINE', 'ONLINE', 'ONLINE', 'ONLINE', 'ONLINE', 'ONSITE', 'ONSITE', 'ONSITE', 'HYBRID', 'HYBRID', 'HYBRID'], 'interview-mode:' || p.row_key),
  p.result_status,
  GREATEST(1, ROUND(p.rounds * (2 + pg_temp.bulk_rand('duration:' || p.row_key) * 7) + pg_temp.bulk_rand('duration-extra:' || p.row_key) * 5))::INT,
  CASE WHEN p.rounds = 1 THEN 'There was a single round: ' ELSE 'The process had ' || p.rounds || ' rounds: ' END
    || REGEXP_REPLACE(stages.list, ', ([^,]*)$', ' and \1') || '. '
    || pg_temp.bulk_pick(ARRAY[
      'Feedback came within a week of the final round.', 'The recruiter kept me updated at every step.',
      'There was a two-week gap before the final round.', 'Interviewers were friendly and gave me time to think.',
      'The final round focused more on motivation than on skills.', 'I heard the outcome by email a few days later.',
      'Scheduling took a while, but each interview started on time.', 'The panel was well prepared and had read my CV.',
      'Questions were practical and tied to the actual work.',
      'I would have liked more detail about the team before the final round.'], 'interview-closer:' || p.row_key),
  CASE WHEN pg_temp.bulk_rand('questions-present:' || p.row_key) < 0.85 THEN pg_temp.bulk_pick(CASE p.track
      WHEN 'tech' THEN ARRAY['Arrays, hash maps and one medium graph problem', 'REST API design and database indexing',
        'Debugging a small service and explaining trade-offs', 'Object-oriented design and SOLID principles',
        'Concurrency basics and a caching question', 'Designing a URL shortener at a high level',
        'Testing strategy and CI/CD practices', 'SQL joins plus a question about transactions']
      WHEN 'data' THEN ARRAY['SQL joins, aggregation and a small analytical case', 'Window functions and cohort analysis',
        'Hypothesis testing and reading an A/B test result', 'Building a dashboard metric from raw tables',
        'Cleaning a messy CSV and explaining the choices', 'Explaining a regression model to a non-technical audience']
      WHEN 'product' THEN ARRAY['Prioritising a backlog with limited resources', 'Redesigning an onboarding flow',
        'Defining success metrics for a new feature', 'Walking through a past project and its trade-offs',
        'Accessibility considerations in a checkout flow']
      WHEN 'finance' THEN ARRAY['Reading a balance sheet and basic ratios', 'Credit risk assessment for an SME loan',
        'Regulatory compliance and KYC basics', 'Cash-flow analysis for a small business', 'Excel modelling and reconciliation']
      WHEN 'industrial' THEN ARRAY['Production planning and line balancing', 'Preventive maintenance and root-cause analysis',
        'Quality control charts and tolerances', 'Electrical safety and basic circuit questions',
        'Good manufacturing practice (GMP) basics', 'Lab procedures and documentation standards']
      ELSE ARRAY['Situational questions about handling customers', 'Market sizing for a consumer product',
        'Sales targets and territory planning', 'Motivation for the role and long-term goals',
        'A short case on improving distribution coverage', 'Team conflict and prioritisation scenarios'] END,
      'questions:' || p.row_key) END
FROM bulk_interview_plan p
CROSS JOIN LATERAL (
  SELECT STRING_AGG(stage, ', ' ORDER BY ord) AS list
  FROM (
    SELECT stage, ord FROM UNNEST(CASE p.track
      WHEN 'tech' THEN ARRAY['a recruiter screening call', 'an online coding assessment', 'a live problem-solving interview',
        'a technical interview on the projects in my CV', 'a system design discussion', 'a code review exercise',
        'a conversation with the engineering manager', 'a final HR discussion']
      WHEN 'data' THEN ARRAY['a recruiter screening call', 'a timed SQL test', 'a take-home analysis task',
        'a presentation of the take-home findings', 'a technical interview on statistics',
        'a conversation with the analytics lead', 'a final HR discussion']
      WHEN 'product' THEN ARRAY['a screening call', 'a portfolio walkthrough', 'a product or design exercise',
        'a case discussion with the product team', 'a stakeholder panel', 'a final culture conversation']
      WHEN 'finance' THEN ARRAY['a written test on accounting and analysis', 'a numerical aptitude test', 'a functional interview',
        'a case discussion on a credit proposal', 'a panel with senior management', 'a final HR round']
      WHEN 'industrial' THEN ARRAY['a written technical test', 'a technical interview with the department head',
        'a plant or lab visit', 'a practical assessment', 'a management panel', 'a final HR round']
      ELSE ARRAY['a written aptitude test', 'a group discussion', 'a case study presentation',
        'a functional interview with the line manager', 'a panel interview', 'a final HR round'] END)
      WITH ORDINALITY AS u(stage, ord)
    ORDER BY (ord = 1) DESC, pg_temp.bulk_rand('stage:' || p.row_key || ':' || ord)
    LIMIT p.rounds
  ) chosen
) stages;

-- ---------------------------------------------------------------------------
-- 12. Job postings by the synthetic representatives: mostly published with
--     deadlines relative to today, plus a few drafts and closed vacancies.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_job_template ON COMMIT DROP AS
SELECT t.category, t.title, jr.role_id, jr.role_name, jr.role_category, t.level, t.employment_type,
  pg_temp.bulk_family(jr.role_category, jr.role_name) AS family
FROM (VALUES
  ('tech', 'Associate Software Engineer', 'Software Engineer', 'entry', 'FULL_TIME'),
  ('tech', 'Software Engineer (Backend)', 'Backend Engineer', 'mid', 'FULL_TIME'),
  ('tech', 'Senior Software Engineer', 'Senior Software Engineer', 'senior', 'FULL_TIME'),
  ('tech', 'Frontend Engineer (React)', 'Frontend Engineer', 'mid', 'FULL_TIME'),
  ('tech', 'Full Stack Developer', 'Full Stack Engineer', 'mid', 'FULL_TIME'),
  ('tech', 'Flutter Developer', 'Mobile Application Developer', 'mid', 'FULL_TIME'),
  ('tech', 'QA Automation Engineer', 'QA Automation Engineer', 'mid', 'FULL_TIME'),
  ('tech', 'DevOps Engineer', 'DevOps Engineer', 'mid', 'FULL_TIME'),
  ('tech', 'Data Analyst', 'Data Analyst', 'entry', 'FULL_TIME'),
  ('tech', 'Product Designer', 'Product Designer', 'mid', 'FULL_TIME'),
  ('tech', 'Software Engineering Intern', 'Software Engineer', 'intern', 'INTERN'),
  ('tech', 'Business Analyst', 'Business Analyst', 'mid', 'FULL_TIME'),
  ('tech', 'Technical Project Manager', 'Project Manager', 'senior', 'FULL_TIME'),
  ('fintech', 'Backend Engineer (Payments)', 'Backend Engineer', 'mid', 'FULL_TIME'),
  ('fintech', 'Senior Backend Engineer', 'Senior Software Engineer', 'senior', 'FULL_TIME'),
  ('fintech', 'Android Developer', 'Mobile Application Developer', 'mid', 'FULL_TIME'),
  ('fintech', 'QA Automation Engineer', 'QA Automation Engineer', 'mid', 'FULL_TIME'),
  ('fintech', 'Risk Analyst', 'Risk Analyst', 'mid', 'FULL_TIME'),
  ('fintech', 'Product Manager, Merchant Payments', 'Product Manager', 'senior', 'FULL_TIME'),
  ('fintech', 'Data Analyst', 'Data Analyst', 'entry', 'FULL_TIME'),
  ('fintech', 'Business Development Executive', 'Business Development Executive', 'entry', 'FULL_TIME'),
  ('fintech', 'Compliance Officer', 'Compliance Officer', 'mid', 'FULL_TIME'),
  ('fintech', 'Customer Experience Specialist', 'Customer Support Specialist', 'entry', 'CONTRACT'),
  ('commerce', 'Operations Executive', 'Operations Manager', 'entry', 'FULL_TIME'),
  ('commerce', 'Logistics Coordinator', 'Logistics Coordinator', 'entry', 'FULL_TIME'),
  ('commerce', 'Software Engineer', 'Software Engineer', 'mid', 'FULL_TIME'),
  ('commerce', 'Data Analyst', 'Data Analyst', 'mid', 'FULL_TIME'),
  ('commerce', 'Customer Support Executive', 'Customer Support Specialist', 'entry', 'FULL_TIME'),
  ('commerce', 'Business Development Executive', 'Business Development Executive', 'entry', 'FULL_TIME'),
  ('commerce', 'Digital Marketing Executive', 'Digital Marketing Specialist', 'entry', 'FULL_TIME'),
  ('commerce', 'Product Manager', 'Product Manager', 'senior', 'FULL_TIME'),
  ('commerce', 'UI/UX Designer', 'UI/UX Designer', 'mid', 'FULL_TIME'),
  ('commerce', 'Operations Intern', 'Operations Manager', 'intern', 'INTERN'),
  ('telecom', 'Network Engineer', 'Network Engineer', 'mid', 'FULL_TIME'),
  ('telecom', 'Senior Network Planning Engineer', 'Network Engineer', 'senior', 'FULL_TIME'),
  ('telecom', 'Graduate Trainee', 'Graduate Trainee', 'entry', 'FULL_TIME'),
  ('telecom', 'Data Engineer', 'Data Engineer', 'mid', 'FULL_TIME'),
  ('telecom', 'Key Account Manager, Enterprise', 'Key Account Manager', 'mid', 'FULL_TIME'),
  ('telecom', 'Digital Marketing Specialist', 'Digital Marketing Specialist', 'mid', 'FULL_TIME'),
  ('telecom', 'Cloud Engineer', 'Cloud Engineer', 'mid', 'FULL_TIME'),
  ('telecom', 'Business Intelligence Analyst', 'Business Intelligence Analyst', 'mid', 'FULL_TIME'),
  ('bank', 'Relationship Manager, SME Banking', 'Relationship Manager', 'mid', 'FULL_TIME'),
  ('bank', 'Credit Analyst', 'Credit Analyst', 'mid', 'FULL_TIME'),
  ('bank', 'Management Trainee Officer', 'Management Trainee', 'entry', 'FULL_TIME'),
  ('bank', 'Junior Officer, Branch Banking', 'Banking Officer', 'entry', 'FULL_TIME'),
  ('bank', 'Compliance Officer', 'Compliance Officer', 'mid', 'FULL_TIME'),
  ('bank', 'Risk Analyst', 'Risk Analyst', 'mid', 'FULL_TIME'),
  ('bank', 'Software Engineer, Digital Banking', 'Software Engineer', 'mid', 'FULL_TIME'),
  ('bank', 'Data Analyst', 'Data Analyst', 'mid', 'FULL_TIME'),
  ('pharma', 'Medical Promotion Officer', 'Medical Promotion Officer', 'entry', 'FULL_TIME'),
  ('pharma', 'Quality Control Officer', 'Quality Control Officer', 'entry', 'FULL_TIME'),
  ('pharma', 'Production Officer', 'Production Engineer', 'entry', 'FULL_TIME'),
  ('pharma', 'Executive, Quality Assurance', 'Pharmacist', 'mid', 'FULL_TIME'),
  ('pharma', 'Management Trainee, Marketing', 'Management Trainee', 'entry', 'FULL_TIME'),
  ('pharma', 'Research Officer, Product Development', 'Research Associate', 'mid', 'FULL_TIME'),
  ('fmcg', 'Management Trainee', 'Management Trainee', 'entry', 'FULL_TIME'),
  ('fmcg', 'Territory Sales Officer', 'Sales Executive', 'entry', 'FULL_TIME'),
  ('fmcg', 'Assistant Brand Manager', 'Brand Manager', 'mid', 'FULL_TIME'),
  ('fmcg', 'Key Account Executive', 'Key Account Manager', 'entry', 'FULL_TIME'),
  ('fmcg', 'Supply Chain Analyst', 'Supply Chain Analyst', 'mid', 'FULL_TIME'),
  ('fmcg', 'Digital Marketing Executive', 'Digital Marketing Specialist', 'entry', 'FULL_TIME'),
  ('fmcg', 'Procurement Executive', 'Procurement Officer', 'mid', 'FULL_TIME'),
  ('conglomerate', 'Management Trainee', 'Management Trainee', 'entry', 'FULL_TIME'),
  ('conglomerate', 'Sales Executive', 'Sales Executive', 'entry', 'FULL_TIME'),
  ('conglomerate', 'Accounts Executive', 'Accountant', 'entry', 'FULL_TIME'),
  ('conglomerate', 'Financial Analyst', 'Financial Analyst', 'mid', 'FULL_TIME'),
  ('conglomerate', 'HR Executive', 'Human Resources Officer', 'entry', 'FULL_TIME'),
  ('conglomerate', 'Supply Chain Executive', 'Supply Chain Analyst', 'entry', 'FULL_TIME'),
  ('industrial', 'Electrical Engineer', 'Electrical Engineer', 'mid', 'FULL_TIME'),
  ('industrial', 'Mechanical Engineer', 'Mechanical Engineer', 'mid', 'FULL_TIME'),
  ('industrial', 'Production Engineer', 'Production Engineer', 'entry', 'FULL_TIME'),
  ('industrial', 'Quality Control Engineer', 'Quality Control Officer', 'mid', 'FULL_TIME'),
  ('industrial', 'Embedded Software Engineer', 'Software Engineer', 'mid', 'FULL_TIME'),
  ('industrial', 'Industrial Engineer', 'Industrial Engineer', 'entry', 'FULL_TIME')
) AS t(category, title, role_name, level, employment_type)
JOIN job_roles jr ON jr.role_name = t.role_name;

CREATE TEMP TABLE bulk_job_plan ON COMMIT DROP AS
WITH per_company AS (
  SELECT r.user_id AS creator_id, cr.assignment_id, c.company_id, c.company_name, c.country, c.city, c.category,
    c.weight, c.pay_factor,
    2 + FLOOR(c.weight * 0.3 + pg_temp.bulk_rand('job-count:' || c.company_name) * 2)::INT AS job_count
  FROM bulk_rep_plan r
  JOIN company_representatives cr ON cr.user_id = r.user_id AND cr.company_id = r.company_id AND cr.assignment_status = 'ACTIVE'
  JOIN bulk_company c ON c.company_id = r.company_id
),
chosen AS (
  SELECT pc.*, t.title, t.role_id, t.role_name, t.role_category, t.level, t.employment_type, t.family,
    pg_temp.bulk_rand('job-status:' || pc.company_name || ':' || t.title) AS status_roll,
    pg_temp.bulk_rand('job-age:' || pc.company_name || ':' || t.title) AS age_roll
  FROM per_company pc
  CROSS JOIN LATERAL (
    SELECT * FROM bulk_job_template jt
    WHERE jt.category = pc.category
    ORDER BY pg_temp.bulk_rand('job-pick:' || pc.company_name || ':' || jt.title)
    LIMIT pc.job_count
  ) t
)
SELECT NEXTVAL(pg_get_serial_sequence('job_postings', 'job_id')) AS jid, ch.*,
  ch.company_name || ':' || ch.title AS job_key,
  CASE WHEN ch.status_roll < 0.86 THEN 'PUBLISHED' WHEN ch.status_roll < 0.93 THEN 'DRAFT' ELSE 'CLOSED' END AS job_status,
  CASE WHEN ch.status_roll >= 0.93
       THEN CURRENT_TIMESTAMP - ((60 + FLOOR(ch.age_roll * 60)) || ' days')::INTERVAL
       ELSE CURRENT_TIMESTAMP - ((2 + FLOOR(ch.age_roll * 43)) || ' days')::INTERVAL
            - ((FLOOR(pg_temp.bulk_rand('job-hour:' || ch.company_name || ':' || ch.title) * 600)) || ' minutes')::INTERVAL END AS published_at,
  CASE WHEN ch.status_roll >= 0.93
       THEN (CURRENT_DATE - (60 + FLOOR(ch.age_roll * 60))::INT + 30)
       ELSE CURRENT_DATE + (7 + FLOOR(pg_temp.bulk_rand('job-deadline:' || ch.company_name || ':' || ch.title) * 84))::INT END AS deadline,
  pg_temp.bulk_rand('job-salary:' || ch.company_name || ':' || ch.title) < 0.75 AS shows_salary,
  pg_temp.bulk_mid(ch.country) * pg_temp.bulk_category_factor(ch.category)
    * pg_temp.bulk_role_factor(ch.role_category, ch.role_name)
    * CASE ch.level WHEN 'intern' THEN 0.24 WHEN 'entry' THEN CASE WHEN ch.role_category = 'Early Career' THEN 1 ELSE 0.55 END
                    WHEN 'mid' THEN 1.0 ELSE 1.55 END * ch.pay_factor AS pay_mid
FROM chosen ch
WHERE NOT (SELECT has_jobs FROM bulk_state);

INSERT INTO job_postings (job_id, company_id, created_by_user_id, created_by_assignment_id, role_id, title,
  description, requirements, location, employment_type, work_mode, salary_min, salary_max, salary_currency,
  salary_period, application_deadline, job_status, published_at, closed_at, created_at, updated_at)
SELECT j.jid, j.company_id, j.creator_id, j.assignment_id, j.role_id, j.title,
  pg_temp.bulk_pick(ARRAY[
      j.company_name || ' is growing its team and is hiring for the ' || j.title || ' role.',
      'Join ' || j.company_name || ' in the ' || j.title || ' role and work with colleagues who care about doing things well.',
      'We are hiring for the ' || j.title || ' position at ' || j.company_name || '.',
      j.company_name || ' has an opening for the ' || j.title || ' role in ' || CASE WHEN j.country = 'Bangladesh' THEN j.city ELSE 'Dhaka' END || '.'],
    'job-intro:' || j.job_key) || ' '
  || pg_temp.bulk_two(CASE j.family
      WHEN 'tech' THEN ARRAY['You will build and maintain features used by customers every day',
        'You will write clean, tested code and review your teammates'' work', 'You will work closely with product and design on each release',
        'You will help improve reliability, monitoring and deployment', 'You will take part in planning and estimate your own work']
      WHEN 'data' THEN ARRAY['You will turn raw data into dashboards and clear recommendations', 'You will write SQL against large operational datasets',
        'You will work with business teams to define the right metrics', 'You will help keep data pipelines accurate and documented']
      WHEN 'product' THEN ARRAY['You will own requirements for a product area from discovery to launch', 'You will work with engineering and design to plan releases',
        'You will talk to users and turn their feedback into priorities', 'You will track outcomes and report progress to stakeholders']
      WHEN 'design' THEN ARRAY['You will design flows, prototypes and polished interfaces', 'You will run usability tests and share what you learn',
        'You will maintain and extend the design system', 'You will work side by side with engineers during delivery']
      WHEN 'finance' THEN ARRAY['You will manage and grow a portfolio of clients', 'You will prepare credit and risk assessments',
        'You will ensure every file meets regulatory requirements', 'You will analyse financial statements and cash flows']
      WHEN 'industrial' THEN ARRAY['You will plan and supervise production activities', 'You will improve efficiency and reduce downtime on the line',
        'You will ensure quality and safety standards are followed', 'You will coordinate maintenance and technical teams']
      WHEN 'science' THEN ARRAY['You will carry out testing according to standard procedures', 'You will keep accurate records for audits',
        'You will support product development and quality programmes', 'You will build relationships with doctors and pharmacists in your territory']
      WHEN 'marketing' THEN ARRAY['You will meet sales targets across your territory or accounts', 'You will plan campaigns and track their results',
        'You will build strong relationships with distributors and partners', 'You will report market insights to the brand team']
      WHEN 'people' THEN ARRAY['You will manage recruitment from job posting to offer', 'You will support onboarding and employee engagement',
        'You will maintain accurate HR records', 'You will advise managers on HR policies']
      WHEN 'early' THEN ARRAY['You will rotate through several departments during the programme', 'You will take on real projects with senior mentors',
        'You will present your work to the leadership team', 'You will receive structured training throughout the first year']
      ELSE ARRAY['You will keep daily operations running smoothly', 'You will coordinate with internal teams and partners',
        'You will solve customer and operational issues quickly', 'You will track performance and suggest improvements'] END,
    'job-duties:' || j.job_key),
  CASE j.level
    WHEN 'intern' THEN 'Final-year students or recent graduates are welcome to apply.'
    WHEN 'entry' THEN 'A relevant bachelor''s degree; up to 2 years of experience.'
    WHEN 'mid' THEN 'A relevant degree and 2 to 5 years of experience.'
    ELSE 'A relevant degree and at least 5 years of experience, including leading work end to end.' END || ' '
  || pg_temp.bulk_two(CASE j.family
      WHEN 'tech' THEN ARRAY['Strong fundamentals in data structures and problem solving', 'Experience with Git and code review',
        'Familiarity with SQL and relational databases', 'Understanding of REST APIs', 'Experience writing automated tests']
      WHEN 'data' THEN ARRAY['Strong SQL skills', 'Experience with a BI tool such as Power BI or Tableau', 'Good grasp of basic statistics',
        'Comfortable with Python or R for analysis']
      WHEN 'product' THEN ARRAY['Clear written and spoken communication', 'Experience working with engineering teams',
        'Comfort with data to support decisions', 'Ability to manage several stakeholders']
      WHEN 'design' THEN ARRAY['A portfolio showing your process', 'Proficiency in Figma', 'Understanding of accessibility basics',
        'Experience running user interviews']
      WHEN 'finance' THEN ARRAY['Good knowledge of banking products', 'Strong analytical and Excel skills',
        'Understanding of credit and compliance rules', 'Confident communication with clients']
      WHEN 'industrial' THEN ARRAY['Knowledge of production processes', 'Understanding of safety and quality standards',
        'Willingness to work in shifts', 'Experience with maintenance planning']
      WHEN 'science' THEN ARRAY['A degree in pharmacy, chemistry or a related science', 'Knowledge of GMP',
        'Careful documentation habits', 'Willingness to travel within the assigned territory']
      WHEN 'marketing' THEN ARRAY['Strong communication and negotiation skills', 'Willingness to travel',
        'Target-driven mindset', 'Experience with digital marketing tools']
      WHEN 'people' THEN ARRAY['Knowledge of Bangladesh labour law', 'Experience with HR software',
        'Good interpersonal skills', 'Discretion with confidential information']
      ELSE ARRAY['Strong communication skills', 'Comfort with spreadsheets and reporting', 'Problem-solving attitude',
        'Ability to work under pressure'] END,
    'job-requirements:' || j.job_key),
  CASE WHEN j.country = 'Bangladesh' THEN j.city ELSE 'Dhaka' END,
  j.employment_type,
  CASE WHEN j.category IN ('tech', 'fintech', 'commerce')
       THEN pg_temp.bulk_pick(ARRAY['ONSITE', 'ONSITE', 'ONSITE', 'HYBRID', 'HYBRID', 'HYBRID', 'REMOTE'], 'job-mode:' || j.job_key)
       ELSE pg_temp.bulk_pick(ARRAY['ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'ONSITE', 'HYBRID'], 'job-mode:' || j.job_key) END,
  CASE WHEN j.shows_salary THEN ROUND(j.pay_mid * 0.85 / pg_temp.bulk_unit('Bangladesh')) * pg_temp.bulk_unit('Bangladesh') END,
  CASE WHEN j.shows_salary THEN ROUND(j.pay_mid * 1.3 / pg_temp.bulk_unit('Bangladesh')) * pg_temp.bulk_unit('Bangladesh') END,
  CASE WHEN j.shows_salary THEN 'BDT' END,
  CASE WHEN j.shows_salary THEN 'MONTHLY' END,
  j.deadline, j.job_status,
  CASE WHEN j.job_status = 'DRAFT' THEN NULL ELSE j.published_at END,
  CASE WHEN j.job_status = 'CLOSED' THEN LEAST(j.deadline + INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 hour') END,
  j.published_at - ((1 + FLOOR(pg_temp.bulk_rand('job-created:' || j.job_key) * 4)) || ' days')::INTERVAL,
  CASE WHEN j.job_status = 'CLOSED' THEN LEAST(j.deadline + INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 hour') ELSE j.published_at END
FROM (
  -- Jobs at international employers are for their Bangladesh office, in BDT.
  SELECT bjp.jid, bjp.job_key, bjp.creator_id, bjp.assignment_id, bjp.company_id, bjp.company_name, bjp.city, bjp.category,
    bjp.title, bjp.role_id, bjp.role_name, bjp.role_category, bjp.level, bjp.employment_type, bjp.family,
    bjp.job_status, bjp.published_at, bjp.deadline, bjp.shows_salary, bjp.country,
    CASE WHEN bjp.country = 'Bangladesh' THEN bjp.pay_mid
         ELSE pg_temp.bulk_mid('Bangladesh') * pg_temp.bulk_category_factor(bjp.category) * 1.2
              * pg_temp.bulk_role_factor(bjp.role_category, bjp.role_name)
              * CASE bjp.level WHEN 'intern' THEN 0.24 WHEN 'entry' THEN 0.6 WHEN 'mid' THEN 1.0 ELSE 1.55 END END AS pay_mid
  FROM bulk_job_plan bjp
) j;

-- ---------------------------------------------------------------------------
-- 13. Applications and their status history, following the same transitions
--     the application service allows.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_application_plan ON COMMIT DROP AS
WITH candidates AS (
  SELECT DISTINCT ON (job.job_id, person.user_id)
    job.job_id, job.title, job.company_name, job.job_status, job.published_at, job.deadline, job.creator_id,
    person.user_id AS applicant_id, person.idx, a
  FROM generate_series(1, 225) AS a
  CROSS JOIN LATERAL (
    SELECT jp.job_id, jp.title, c.company_name, jp.job_status, jp.published_at, jp.application_deadline AS deadline,
      jp.created_by_user_id AS creator_id
    FROM job_postings jp
    JOIN users u ON u.user_id = jp.created_by_user_id AND u.password_hash = pg_temp.bulk_marker()
    JOIN companies c ON c.company_id = jp.company_id
    JOIN bulk_company bc ON bc.company_id = jp.company_id
    WHERE jp.job_status IN ('PUBLISHED', 'CLOSED')
    ORDER BY -LN(1 - pg_temp.bulk_rand('application-job:' || a || ':' || jp.title || ':' || c.company_name)) / bc.weight
    LIMIT 1
  ) job
  CROSS JOIN LATERAL (
    SELECT p.user_id, p.idx FROM bulk_people p
    WHERE p.grp IN ('contributor', 'seeker') AND p.user_id IS NOT NULL
    ORDER BY pg_temp.bulk_rand('application-person:' || a || ':' || p.idx)
    LIMIT 1
  ) person
  ORDER BY job.job_id, person.user_id, a
),
timed AS (
  SELECT c.*,
    c.published_at + (LEAST(CURRENT_TIMESTAMP - INTERVAL '2 hours', c.deadline::TIMESTAMPTZ) - c.published_at)
      * (0.05 + 0.9 * pg_temp.bulk_rand('application-when:' || c.a)) AS submitted_at,
    pg_temp.bulk_rand('application-status:' || c.a) AS status_roll
  FROM candidates c
)
SELECT NEXTVAL(pg_get_serial_sequence('job_applications', 'application_id')) AS aid, t.*,
  CASE WHEN t.job_status = 'CLOSED' THEN
         CASE WHEN t.status_roll < 0.60 THEN 'REJECTED' WHEN t.status_roll < 0.78 THEN 'ACCEPTED'
              WHEN t.status_roll < 0.88 THEN 'SHORTLISTED' ELSE 'WITHDRAWN' END
       ELSE
         CASE WHEN t.status_roll < 0.32 THEN 'SUBMITTED' WHEN t.status_roll < 0.57 THEN 'UNDER_REVIEW'
              WHEN t.status_roll < 0.72 THEN 'SHORTLISTED' WHEN t.status_roll < 0.87 THEN 'REJECTED'
              WHEN t.status_roll < 0.92 THEN 'ACCEPTED' ELSE 'WITHDRAWN' END END AS final_status,
  CASE WHEN pg_temp.bulk_rand('application-reject-early:' || t.a) < 0.3 THEN TRUE ELSE FALSE END AS reject_early
FROM timed t
WHERE NOT (SELECT has_applications FROM bulk_state)
  AND t.submitted_at < CURRENT_TIMESTAMP - INTERVAL '1 hour';

-- The status path for each application, one row per history step. Step times
-- are spread between submission and now, so nothing is dated in the future.
CREATE TEMP TABLE bulk_application_step ON COMMIT DROP AS
SELECT p.aid, p.applicant_id, p.creator_id, step.step_no, step.previous_status, step.new_status,
  CASE WHEN step.new_status IN ('SUBMITTED', 'WITHDRAWN') THEN p.applicant_id ELSE p.creator_id END AS actor_id,
  CASE WHEN step.step_no = 1 THEN p.submitted_at
       ELSE p.submitted_at + (CURRENT_TIMESTAMP - INTERVAL '30 minutes' - p.submitted_at)
            * LEAST(0.95, (step.step_no - 1) * (0.12 + 0.15 * pg_temp.bulk_rand('step-pace:' || p.a))) END AS action_at,
  CASE step.new_status
    WHEN 'SUBMITTED' THEN 'Application submitted.'
    WHEN 'UNDER_REVIEW' THEN pg_temp.bulk_pick(ARRAY['Moved to screening.', 'CV under review by the hiring team.', 'Screening started.'], 'note-review:' || p.a)
    WHEN 'SHORTLISTED' THEN pg_temp.bulk_pick(ARRAY['Shortlisted for interview.', 'Invited to the interview stage.', 'Shortlisted by the hiring manager.'], 'note-short:' || p.a)
    WHEN 'ACCEPTED' THEN pg_temp.bulk_pick(ARRAY['Offer made after the final interview.', 'Selected for the role; offer letter sent.', 'Accepted after the final panel.'], 'note-accept:' || p.a)
    WHEN 'REJECTED' THEN pg_temp.bulk_pick(ARRAY['Thank you for applying; we moved forward with other candidates.',
      'The role needs more experience with the core tools.', 'We chose a candidate whose background matched the team''s current needs more closely.',
      'Thank you for your time; we will keep your profile for future openings.'], 'note-reject:' || p.a)
    WHEN 'WITHDRAWN' THEN 'Withdrawn by the applicant.' END AS action_note
FROM bulk_application_plan p
CROSS JOIN LATERAL (
  SELECT step_no, previous_status, new_status FROM (VALUES
    (1, NULL, 'SUBMITTED', TRUE),
    (2, 'SUBMITTED', 'UNDER_REVIEW', p.final_status IN ('UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED')
                                     OR (p.final_status = 'REJECTED' AND NOT p.reject_early)),
    (2, 'SUBMITTED', 'REJECTED', p.final_status = 'REJECTED' AND p.reject_early),
    (2, 'SUBMITTED', 'WITHDRAWN', p.final_status = 'WITHDRAWN'),
    (3, 'UNDER_REVIEW', 'SHORTLISTED', p.final_status IN ('SHORTLISTED', 'ACCEPTED')),
    (3, 'UNDER_REVIEW', 'REJECTED', p.final_status = 'REJECTED' AND NOT p.reject_early),
    (4, 'SHORTLISTED', 'ACCEPTED', p.final_status = 'ACCEPTED')
  ) AS path(step_no, previous_status, new_status, included)
  WHERE included
) step;

INSERT INTO job_applications (application_id, job_id, applicant_user_id, cover_letter, application_status,
  submitted_at, updated_at, reviewed_by, reviewed_at)
SELECT p.aid, p.job_id, p.applicant_id,
  pg_temp.bulk_pick(ARRAY[
      'I would like to apply for the ' || p.title || ' role at ' || p.company_name || '.',
      'Please consider my application for the ' || p.title || ' position.',
      'I am excited to apply for the ' || p.title || ' opening at ' || p.company_name || '.'], 'cover-open:' || p.a) || ' '
  || pg_temp.bulk_pick(ARRAY[
      'My recent work has involved similar responsibilities, and I enjoy learning from experienced teams.',
      'I have followed the company''s work for some time and would value the chance to contribute.',
      'My degree and internship gave me a practical foundation for this role.',
      'I work well with cross-functional teams and take ownership of what I deliver.',
      'I am comfortable learning new tools quickly and communicating clearly with stakeholders.'], 'cover-body:' || p.a) || ' '
  || pg_temp.bulk_pick(ARRAY['Thank you for considering my application.', 'I look forward to hearing from you.',
      'I would be glad to discuss how I can help the team.'], 'cover-close:' || p.a),
  p.final_status, p.submitted_at,
  (SELECT MAX(s.action_at) FROM bulk_application_step s WHERE s.aid = p.aid),
  CASE WHEN p.final_status IN ('SUBMITTED', 'WITHDRAWN') THEN NULL ELSE p.creator_id END,
  CASE WHEN p.final_status IN ('SUBMITTED', 'WITHDRAWN') THEN NULL
       ELSE (SELECT MAX(s.action_at) FROM bulk_application_step s WHERE s.aid = p.aid AND s.actor_id = p.creator_id) END
FROM bulk_application_plan p;

INSERT INTO job_application_status_history (application_id, actor_user_id, previous_status, new_status, action_note, action_at)
SELECT aid, actor_id, previous_status, new_status, action_note, action_at
FROM bulk_application_step
ORDER BY aid, step_no;

-- ---------------------------------------------------------------------------
-- 14. Professional profiles for most synthetic users: headline, about,
--     experience matching their employers, education and skills.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE bulk_profile ON COMMIT DROP AS
SELECT p.idx, p.user_id, p.grp, p.first_name, main.company_name, main.role_name,
  COALESCE(main.family, CASE WHEN p.grp = 'rep' THEN 'people'
    ELSE pg_temp.bulk_pick(ARRAY['tech', 'tech', 'data', 'finance', 'marketing', 'design', 'industrial'], 'seeker-field:' || p.idx) END) AS family,
  main.end_days_ago = 0 AS currently_employed,
  COALESCE(r.company_name, main.company_name) AS employer,
  -- A representative has been in the role since before joining Saple.
  CASE WHEN p.grp = 'rep'
    THEN DATE_TRUNC('month', p.joined_at - ((200 + FLOOR(pg_temp.bulk_rand('rep-start:' || p.idx) * 1200)) || ' days')::INTERVAL)::DATE END AS rep_start,
  -- When the working life began, so education can finish before it.
  CASE WHEN p.grp = 'contributor'
       THEN (SELECT CURRENT_DATE - MAX(s.end_days_ago + s.tenure_days)::INT FROM bulk_scope s WHERE s.user_id = p.user_id)
       WHEN p.grp = 'rep'
       THEN DATE_TRUNC('month', p.joined_at - ((200 + FLOOR(pg_temp.bulk_rand('rep-start:' || p.idx) * 1200)) || ' days')::INTERVAL)::DATE
  END AS career_start
FROM bulk_people p
LEFT JOIN bulk_scope main ON main.user_id = p.user_id AND main.scope_no = 1
LEFT JOIN bulk_rep_plan r ON r.user_id = p.user_id
JOIN users u ON u.user_id = p.user_id
WHERE p.user_id IS NOT NULL
  AND u.headline IS NULL
  AND NOT EXISTS (SELECT 1 FROM user_experience x WHERE x.user_id = p.user_id)
  AND NOT EXISTS (SELECT 1 FROM user_education x WHERE x.user_id = p.user_id)
  AND pg_temp.bulk_rand('has-profile:' || p.idx) < CASE p.grp WHEN 'seeker' THEN 1 WHEN 'contributor' THEN 0.78 ELSE 0.55 END;

UPDATE users u SET
  headline = CASE
    WHEN bp.grp = 'rep' THEN 'Hiring for ' || bp.employer || ' · talent acquisition and people operations'
    WHEN bp.grp = 'contributor' AND bp.currently_employed AND pg_temp.bulk_rand('headline-style:' || bp.idx) < 0.5
      THEN bp.role_name || ' at ' || bp.company_name
    ELSE pg_temp.bulk_pick(CASE bp.family
      WHEN 'tech' THEN ARRAY['Backend engineer focused on Node.js and PostgreSQL', 'Full stack developer who enjoys clean, tested code',
        'Mobile developer building Flutter apps for everyday payments', 'QA engineer who automates the repetitive parts',
        'DevOps engineer keeping deployments calm and repeatable', 'Software engineer interested in distributed systems',
        'Frontend developer who cares about accessibility']
      WHEN 'data' THEN ARRAY['Data analyst turning messy data into clear decisions', 'Data engineer building reliable pipelines',
        'BI analyst who loves a well-designed dashboard', 'Aspiring data scientist working with Python and SQL']
      WHEN 'product' THEN ARRAY['Product manager working on fintech onboarding', 'Business analyst interested in fintech and data',
        'Project manager for software delivery teams']
      WHEN 'design' THEN ARRAY['Product designer building accessible web products', 'UX designer focused on research-led design',
        'UI designer with a soft spot for design systems']
      WHEN 'finance' THEN ARRAY['Banker focused on SME relationships and credit', 'Finance professional working on risk and compliance',
        'Credit analyst learning the ropes of corporate banking', 'Chartered accountancy student with an audit background']
      WHEN 'industrial' THEN ARRAY['EEE graduate working in industrial automation', 'Mechanical engineer in large-scale manufacturing',
        'Textile engineer interested in sustainable production', 'Industrial engineer improving line efficiency']
      WHEN 'science' THEN ARRAY['Pharmacist working in quality control', 'Research associate in public health',
        'Chemist with a focus on analytical testing']
      WHEN 'people' THEN ARRAY['HR professional focused on early-career hiring', 'People partner who enjoys building teams']
      WHEN 'marketing' THEN ARRAY['Brand and marketing professional in FMCG', 'Sales professional who likes field work and people',
        'Digital marketer running data-driven campaigns']
      WHEN 'early' THEN ARRAY['Management trainee rotating across business functions', 'Graduate trainee learning the whole business']
      ELSE ARRAY['Operations professional who keeps things moving', 'Supply chain analyst improving distribution planning',
        'Customer experience specialist who likes solving problems'] END, 'headline:' || bp.idx) END,
  bio = pg_temp.bulk_pick(CASE bp.family
      WHEN 'tech' THEN ARRAY['I have spent the last few years building backend services and internal tools.',
        'I enjoy working on products where reliability matters as much as new features.',
        'Most of my work is in web applications, APIs and the databases behind them.']
      WHEN 'data' THEN ARRAY['I work with SQL and Python to answer business questions quickly and honestly.',
        'I like building dashboards that people actually open every morning.',
        'My background is in statistics, and I now work on product and marketing analytics.']
      WHEN 'product' THEN ARRAY['I bridge business goals and engineering plans, and I enjoy both sides.',
        'I have worked on onboarding, payments and reporting features.']
      WHEN 'design' THEN ARRAY['I design interfaces that are simple to use and inclusive by default.',
        'I care about research, prototypes and working closely with engineers.']
      WHEN 'finance' THEN ARRAY['I have worked in branch and SME banking, focusing on client relationships and credit.',
        'My work covers credit assessment, compliance checks and portfolio reporting.']
      WHEN 'industrial' THEN ARRAY['I have worked on production floors, maintenance planning and process improvement.',
        'I enjoy practical engineering problems and working with large teams on the shop floor.']
      WHEN 'science' THEN ARRAY['I work in laboratory testing and quality documentation.',
        'My background is in pharmacy, and I am interested in quality systems and research.']
      WHEN 'people' THEN ARRAY['I lead hiring for technical and business teams and look after new joiners.',
        'I have spent several years in recruitment and people operations.']
      WHEN 'marketing' THEN ARRAY['I have worked in sales and brand teams for consumer products.',
        'I enjoy fieldwork, market visits and turning insights into campaigns.']
      ELSE ARRAY['I have worked in operations and customer-facing roles for several years.',
        'I like improving processes so teams spend less time on repetitive work.'] END, 'bio-a:' || bp.idx)
    || ' ' || pg_temp.bulk_pick(ARRAY['Outside work I mentor university students.', 'Currently taking an online course to broaden my skills.',
      'Open to conversations about career growth in Bangladesh.', 'Writes now and then about lessons from work.',
      'Happy to help juniors preparing for interviews.', 'Interested in teams that value quality and kindness.',
      'I volunteer with a local coding club on weekends.', 'Always keen to swap book recommendations.'], 'bio-b:' || bp.idx)
FROM bulk_profile bp
WHERE u.user_id = bp.user_id;

INSERT INTO user_experience (user_id, organization, job_title, employment_type, location, start_date, end_date,
  currently_working, description)
SELECT s.user_id, s.company_name, s.role_name,
  CASE WHEN s.role_category = 'Early Career' THEN 'Full-time' ELSE pg_temp.bulk_pick(ARRAY['Full-time', 'Full-time', 'Full-time', 'Full-time', 'Contract'], 'exp-type:' || s.idx || ':' || s.scope_no) END,
  s.city,
  DATE_TRUNC('month', CURRENT_DATE - (s.end_days_ago + s.tenure_days)::INT)::DATE,
  CASE WHEN s.end_days_ago = 0 THEN NULL
       ELSE GREATEST(DATE_TRUNC('month', CURRENT_DATE - s.end_days_ago::INT)::DATE,
                     DATE_TRUNC('month', CURRENT_DATE - (s.end_days_ago + s.tenure_days)::INT)::DATE) END,
  s.end_days_ago = 0,
  CASE WHEN pg_temp.bulk_rand('exp-desc:' || s.idx || ':' || s.scope_no) < 0.5 THEN pg_temp.bulk_pick(ARRAY[
    'Worked in a cross-functional team on day-to-day delivery.', 'Took ownership of several projects from start to finish.',
    'Mentored new joiners and documented team processes.', 'Worked closely with stakeholders to meet quarterly goals.'],
    'exp-desc-text:' || s.idx || ':' || s.scope_no) END
FROM bulk_scope s
JOIN bulk_profile bp ON bp.user_id = s.user_id
WHERE s.end_days_ago IS NOT NULL;

-- Representatives list their current role at the company they hire for.
INSERT INTO user_experience (user_id, organization, job_title, employment_type, location, start_date, currently_working)
SELECT bp.user_id, r.company_name, r.job_title, 'Full-time', c.city, bp.rep_start, TRUE
FROM bulk_profile bp
JOIN bulk_rep_plan r ON r.user_id = bp.user_id
JOIN bulk_company c ON c.company_id = r.company_id;

INSERT INTO user_education (user_id, institution, degree, field_of_study, start_date, end_date, currently_studying, description)
SELECT bp.user_id,
  pg_temp.bulk_pick(ARRAY['Bangladesh University of Engineering and Technology', 'University of Dhaka', 'North South University',
    'BRAC University', 'Islamic University of Technology', 'Khulna University of Engineering and Technology',
    'Rajshahi University of Engineering and Technology', 'Chittagong University of Engineering and Technology',
    'Shahjalal University of Science and Technology', 'East West University', 'American International University-Bangladesh',
    'Jahangirnagar University', 'Independent University, Bangladesh', 'University of Manchester', 'National University of Singapore',
    'Technical University of Munich'], 'institution:' || bp.idx),
  CASE WHEN bp.family IN ('finance', 'marketing', 'people', 'early', 'business') THEN pg_temp.bulk_pick(ARRAY['BBA', 'BBA', 'MBA'], 'degree:' || bp.idx)
       WHEN bp.family = 'science' THEN pg_temp.bulk_pick(ARRAY['B.Pharm', 'M.Pharm', 'BSc'], 'degree:' || bp.idx)
       ELSE pg_temp.bulk_pick(ARRAY['BSc', 'BSc', 'BSc', 'MSc'], 'degree:' || bp.idx) END,
  pg_temp.bulk_pick(CASE bp.family
    WHEN 'tech' THEN ARRAY['Computer Science and Engineering', 'Computer Science and Engineering', 'Electrical and Electronic Engineering', 'Software Engineering']
    WHEN 'data' THEN ARRAY['Computer Science and Engineering', 'Statistics', 'Applied Mathematics', 'Economics']
    WHEN 'product' THEN ARRAY['Computer Science and Engineering', 'Industrial and Production Engineering', 'Business Administration']
    WHEN 'design' THEN ARRAY['Computer Science and Engineering', 'Architecture', 'Fine Arts']
    WHEN 'finance' THEN ARRAY['Finance', 'Accounting', 'Banking and Insurance', 'Economics']
    WHEN 'industrial' THEN ARRAY['Mechanical Engineering', 'Electrical and Electronic Engineering', 'Industrial and Production Engineering', 'Textile Engineering']
    WHEN 'science' THEN ARRAY['Pharmacy', 'Chemistry', 'Microbiology', 'Public Health']
    WHEN 'people' THEN ARRAY['Human Resource Management', 'Management', 'Sociology']
    WHEN 'marketing' THEN ARRAY['Marketing', 'Business Administration', 'Economics']
    ELSE ARRAY['Business Administration', 'Management', 'Supply Chain Management'] END, 'field:' || bp.idx),
  (edu.finished - INTERVAL '4 years')::DATE,
  CASE WHEN edu.studying THEN NULL ELSE edu.finished END,
  edu.studying,
  NULL
FROM bulk_profile bp
CROSS JOIN LATERAL (
  SELECT
    bp.grp = 'seeker' AND pg_temp.bulk_rand('studying:' || bp.idx) < 0.35 AS studying,
    -- A four-year degree that ends before the first job (or recently, for
    -- job seekers). Still-studying seekers started within the last few years.
    DATE_TRUNC('month', CASE
      WHEN bp.grp = 'seeker' AND pg_temp.bulk_rand('studying:' || bp.idx) < 0.35
        THEN CURRENT_DATE + ((365 + FLOOR(pg_temp.bulk_rand('grad:' || bp.idx) * 900))::INT)
      WHEN bp.career_start IS NULL
        THEN CURRENT_DATE - ((30 + FLOOR(pg_temp.bulk_rand('grad:' || bp.idx) * 420))::INT)
      ELSE bp.career_start - ((30 + FLOOR(pg_temp.bulk_rand('grad:' || bp.idx) * 210))::INT) END)::DATE AS finished
) edu;

CREATE TEMP TABLE bulk_skill_plan ON COMMIT DROP AS
SELECT DISTINCT ON (bp.user_id, LOWER(skill.name)) bp.user_id, skill.name
FROM bulk_profile bp
CROSS JOIN LATERAL (
  SELECT name FROM UNNEST(CASE bp.family
    WHEN 'tech' THEN ARRAY['JavaScript', 'TypeScript', 'Node.js', 'PostgreSQL', 'React', 'Docker', 'Git', 'Java', 'Python', 'REST APIs', 'Flutter', 'AWS']
    WHEN 'data' THEN ARRAY['SQL', 'Python', 'Power BI', 'Tableau', 'Statistics', 'Excel', 'PostgreSQL', 'Data visualisation']
    WHEN 'product' THEN ARRAY['Product discovery', 'Roadmapping', 'SQL', 'Stakeholder management', 'Jira', 'User research']
    WHEN 'design' THEN ARRAY['Figma', 'User research', 'Prototyping', 'Design systems', 'Accessibility', 'Usability testing']
    WHEN 'finance' THEN ARRAY['Credit analysis', 'Financial modelling', 'Excel', 'Compliance', 'KYC', 'Portfolio management']
    WHEN 'industrial' THEN ARRAY['AutoCAD', 'PLC programming', 'Lean manufacturing', 'Preventive maintenance', 'Six Sigma', 'Quality control']
    WHEN 'science' THEN ARRAY['GMP', 'HPLC', 'Quality control', 'Laboratory safety', 'Documentation', 'Data analysis']
    WHEN 'people' THEN ARRAY['Recruitment', 'Onboarding', 'Employer branding', 'HR analytics', 'Interviewing']
    WHEN 'marketing' THEN ARRAY['Brand management', 'Digital marketing', 'Market research', 'Negotiation', 'Sales planning', 'Content writing']
    ELSE ARRAY['Operations', 'Excel', 'Customer service', 'Supply chain', 'Communication', 'Problem solving'] END) AS name
  ORDER BY pg_temp.bulk_rand('skill:' || bp.idx || ':' || name)
  LIMIT 3 + FLOOR(pg_temp.bulk_rand('skill-count:' || bp.idx) * 4)::INT
) skill;

-- The skill catalogue is shared and case-insensitive, so an existing spelling
-- of a skill is reused rather than duplicated.
INSERT INTO skills (skill_name)
SELECT DISTINCT name FROM bulk_skill_plan
ON CONFLICT DO NOTHING;

INSERT INTO user_skills (user_id, skill_id)
SELECT sp.user_id, s.skill_id
FROM bulk_skill_plan sp
JOIN skills s ON LOWER(s.skill_name) = LOWER(sp.name)
ON CONFLICT DO NOTHING;

COMMIT;

-- ===========================================================================
-- 15. Read-only validation. Run after the script; nothing below changes data.
-- ===========================================================================

-- Totals.
SELECT
  (SELECT COUNT(*) FROM companies) AS companies,
  (SELECT COUNT(*) FROM job_roles) AS job_roles,
  (SELECT COUNT(*) FROM benefits) AS benefits,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM submissions) AS submissions,
  (SELECT COUNT(*) FROM salary_submissions) AS salary_submissions,
  (SELECT COUNT(*) FROM company_reviews) AS company_reviews,
  (SELECT COUNT(*) FROM interview_experiences) AS interview_experiences,
  (SELECT COUNT(*) FROM job_postings) AS job_postings,
  (SELECT COUNT(*) FROM job_applications) AS job_applications;

-- Submissions per company (top 20).
SELECT c.company_name, s.submission_type, COUNT(*) AS submissions
FROM submissions s JOIN companies c ON c.company_id = s.company_id
GROUP BY c.company_name, s.submission_type
ORDER BY COUNT(*) DESC LIMIT 20;

-- Salary observations per company and role (top 20), approved only.
SELECT company_name, role_name, currency, pay_period, contribution_count, minimum_salary, average_salary, maximum_salary
FROM vw_community_salary_summary
ORDER BY contribution_count DESC, company_name LIMIT 20;

-- Average rating per company (companies with at least three approved reviews).
SELECT company_name, ROUND(AVG(overall_rating), 2) AS average_rating, COUNT(*) AS reviews
FROM vw_public_approved_reviews
GROUP BY company_name HAVING COUNT(*) >= 3
ORDER BY reviews DESC LIMIT 25;

-- Jobs by status, interviews by difficulty, applications by status.
SELECT 'job' AS kind, job_status AS status, COUNT(*) FROM job_postings GROUP BY job_status
UNION ALL
SELECT 'interview', difficulty_level, COUNT(*) FROM interview_experiences GROUP BY difficulty_level
UNION ALL
SELECT 'application', application_status, COUNT(*) FROM job_applications GROUP BY application_status
ORDER BY kind, status;
