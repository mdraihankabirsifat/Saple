# Saple Relational Schema

## USERS

USERS(user_id PK, name, email UK, password_hash, user_type, created_at)

## COMPANIES

COMPANIES(company_id PK, company_name, industry, location, website, created_at)

## JOB_ROLES

JOB_ROLES(role_id PK, role_name UK)

## BENEFITS

BENEFITS(benefit_id PK, benefit_name UK)

## USER_COMPANY_VERIFICATIONS

USER_COMPANY_VERIFICATIONS(
verification_id PK,
user_id FK,
company_id FK,
employment_status,
verification_method,
company_email,
document_type,
verification_status,
submitted_at,
verified_at
)

## SALARY_SUBMISSIONS

SALARY_SUBMISSIONS(
salary_id PK,
user_id FK,
company_id FK,
role_id FK,
min_salary,
max_salary,
experience_level,
verification_status,
submission_status,
created_at
)

## COMPANY_REVIEWS

COMPANY_REVIEWS(
review_id PK,
user_id FK,
company_id FK,
rating,
work_life_balance,
career_growth,
management_rating,
pros,
cons,
verification_status,
submission_status,
created_at
)

## INTERVIEW_EXPERIENCES

INTERVIEW_EXPERIENCES(
interview_id PK,
user_id FK,
company_id FK,
role_id FK,
difficulty_level,
interview_rounds,
experience_text,
result_status,
submission_status,
created_at
)

## COMPANY_BENEFITS

COMPANY_BENEFITS(company_id FK, benefit_id FK)

## SUBMISSION_REPORTS

SUBMISSION_REPORTS(
report_id PK,
reporter_user_id FK,
submission_type,
submission_id,
reason,
report_status,
created_at
)

## ADMIN_ACTIONS

ADMIN_ACTIONS(
action_id PK,
admin_id FK,
target_type,
target_id,
action_type,
action_note,
created_at
)