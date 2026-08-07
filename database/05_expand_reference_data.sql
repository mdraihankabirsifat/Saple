-- Additive reference-data expansion for Saple.
--
-- Run after 03_insert_sample_data.sql. MERGE keeps this script idempotent and
-- preserves all fictional demonstration records and user-generated content.
-- Company metadata sources are recorded in company_seed_sources.md.

MERGE INTO companies target
USING (
    SELECT 'Grameenphone' company_name, 'Telecommunications' industry, 'Dhaka' headquarters_city, 'Bangladesh' country, 'https://www.grameenphone.com' website, '5001-10000' company_size, 'A Bangladesh telecommunications and digital services provider.' description FROM dual
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
    UNION ALL SELECT 'ACI', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.aci-bd.com', '10000+', 'A Bangladesh group active in pharmaceuticals, consumer brands, agribusiness, and retail.' FROM dual
    UNION ALL SELECT 'PRAN-RFL Group', 'Consumer Goods', 'Dhaka', 'Bangladesh', 'https://www.pranrflgroup.com', '10000+', 'A Bangladesh group producing food, beverages, plastics, and household products.' FROM dual
    UNION ALL SELECT 'Walton Hi-Tech Industries', 'Electronics Manufacturing', 'Gazipur', 'Bangladesh', 'https://waltonbd.com', '10000+', 'A Bangladesh manufacturer of electronics, electrical appliances, and technology products.' FROM dual
    UNION ALL SELECT 'Bashundhara Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.bashundharagroup.com', '10000+', 'A Bangladesh group with businesses spanning manufacturing, property, media, and services.' FROM dual
    UNION ALL SELECT 'Akij Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://akij.net', '10000+', 'A Bangladesh industrial group with operations across consumer and manufacturing sectors.' FROM dual
    UNION ALL SELECT 'Meghna Group of Industries', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.mgi.org', '10000+', 'A Bangladesh conglomerate active in consumer goods, materials, logistics, and industrial manufacturing.' FROM dual
    UNION ALL SELECT 'Beximco Group', 'Diversified', 'Dhaka', 'Bangladesh', 'https://www.beximco.com', '10000+', 'A Bangladesh business group with operations in manufacturing and services.' FROM dual
    UNION ALL SELECT 'DBL Group', 'Apparel and Textiles', 'Dhaka', 'Bangladesh', 'https://dbl-group.com', '10000+', 'A diversified Bangladesh group with a foundation in apparel and textiles.' FROM dual
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
    UNION ALL SELECT 'BRAC', 'Nonprofit and Development', 'Dhaka', 'Bangladesh', 'https://www.brac.net', '10000+', 'A Bangladesh-founded international development organization.' FROM dual
    UNION ALL SELECT 'Summit Group', 'Power and Infrastructure', 'Dhaka', 'Bangladesh', 'https://summitpowerinternational.com', NULL, 'A Bangladesh-origin infrastructure group focused on power generation and related services.' FROM dual
    UNION ALL SELECT 'Google', 'Technology', 'Mountain View', 'United States', 'https://about.google', '10000+', 'A global technology company building internet, cloud, advertising, and computing products.' FROM dual
    UNION ALL SELECT 'Microsoft', 'Technology', 'Redmond', 'United States', 'https://www.microsoft.com', '10000+', 'A global software, cloud, productivity, and computing company.' FROM dual
    UNION ALL SELECT 'Amazon', 'Technology and Retail', 'Seattle', 'United States', 'https://www.aboutamazon.com', '10000+', 'A global company operating e-commerce, cloud computing, logistics, and digital services.' FROM dual
    UNION ALL SELECT 'IBM', 'Technology and Consulting', 'Armonk', 'United States', 'https://www.ibm.com', '10000+', 'A global technology and consulting company.' FROM dual
    UNION ALL SELECT 'Oracle', 'Technology', 'Austin', 'United States', 'https://www.oracle.com', '10000+', 'A global database, enterprise software, and cloud technology company.' FROM dual
    UNION ALL SELECT 'Samsung Electronics', 'Electronics Manufacturing', 'Suwon', 'South Korea', 'https://www.samsung.com', '10000+', 'A global electronics and technology manufacturer.' FROM dual
    UNION ALL SELECT 'Unilever', 'Consumer Goods', 'London', 'United Kingdom', 'https://www.unilever.com', '10000+', 'A global consumer goods company.' FROM dual
    UNION ALL SELECT 'Nestle', 'Food and Beverage', 'Vevey', 'Switzerland', 'https://www.nestle.com', '10000+', 'A global food and beverage company.' FROM dual
    UNION ALL SELECT 'Siemens', 'Industrial Technology', 'Munich', 'Germany', 'https://www.siemens.com', '10000+', 'A global industrial technology and infrastructure company.' FROM dual
    UNION ALL SELECT 'Deloitte', 'Professional Services', 'London', 'United Kingdom', 'https://www.deloitte.com', '10000+', 'A global professional services organization.' FROM dual
    UNION ALL SELECT 'PwC', 'Professional Services', 'London', 'United Kingdom', 'https://www.pwc.com', '10000+', 'A global assurance, tax, and consulting network.' FROM dual
    UNION ALL SELECT 'Maersk', 'Logistics and Shipping', 'Copenhagen', 'Denmark', 'https://www.maersk.com', '10000+', 'A global logistics and shipping company.' FROM dual
    UNION ALL SELECT 'Toyota', 'Automotive Manufacturing', 'Toyota City', 'Japan', 'https://global.toyota', '10000+', 'A global automotive and mobility manufacturer.' FROM dual
    UNION ALL SELECT 'Pfizer', 'Pharmaceuticals', 'New York', 'United States', 'https://www.pfizer.com', '10000+', 'A global biopharmaceutical company.' FROM dual
    UNION ALL SELECT 'HSBC', 'Banking', 'London', 'United Kingdom', 'https://www.hsbc.com', '10000+', 'A global banking and financial services organization.' FROM dual
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
