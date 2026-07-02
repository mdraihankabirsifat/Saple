# Saple: Verified Company Review and Salary Insight Platform

## 1. Project Overview

Saple is a database project inspired by Glassdoor. It is designed to help fresh graduates and job seekers get reliable information about companies, salary ranges, benefits, workplace culture, and interview experiences.

The platform allows current and former employees to submit company reviews, salary ranges, benefits information, and interview experiences. To reduce fake or defamatory submissions, Saple includes a verification and moderation system.

## 2. Problem Statement

Fresh graduates often lack reliable information about companies before applying or joining. Information about salary, work environment, benefits, and interview process is usually scattered, informal, or biased.

A major problem in public review platforms is fake submissions. Someone may submit a false low salary or negative review to defame a company. Saple solves this problem by separating verified data from community data and by using admin moderation before publishing submissions.

## 3. Target Users

1. Fresh graduates
2. Job seekers
3. Current employees
4. Former employees
5. Admin/moderator

## 4. Main Features

1. Users can register and log in.
2. Users can search companies.
3. Users can view company profiles.
4. Users can submit company reviews.
5. Users can submit salary ranges.
6. Users can submit interview experiences.
7. Users can submit benefits information.
8. Users can request company verification.
9. Admin can approve or reject verification requests.
10. Admin can approve, reject, or flag submissions.
11. Public users can view only approved submissions.
12. Public users can view Verified Salary Range.
13. Public users can view Community Salary Range.
14. The system shows the number of submissions beside each salary range.

## 5. Verification System

Saple supports verification to reduce fake submissions.

Current employees may verify themselves using company email OTP verification.

Former employees may verify themselves using documents such as:

- Offer letter
- Payslip
- Experience certificate
- Resignation or release letter
- Employee ID

Optional reference-based verification may also be supported, where a previously verified employee can help verify another user.

## 6. Salary Range Types

Saple shows two types of salary ranges.

### Verified Salary Range

This range uses only salary submissions where:

- verification_status = VERIFIED
- submission_status = APPROVED

### Community Salary Range

This range uses all approved salary submissions, including both verified and unverified users.

Condition:

- submission_status = APPROVED

The term "Community Range" is used instead of "Unverified Range" because this range includes both verified and unverified approved submissions.

## 7. Main Entities

1. USERS
2. COMPANIES
3. JOB_ROLES
4. BENEFITS
5. USER_COMPANY_VERIFICATIONS
6. SALARY_SUBMISSIONS
7. COMPANY_REVIEWS
8. INTERVIEW_EXPERIENCES
9. COMPANY_BENEFITS
10. SUBMISSION_REPORTS
11. ADMIN_ACTIONS

## 8. Assumptions

1. A user may submit salary information for a company.
2. A user may be verified for one company but not for another company.
3. Verification is company-specific.
4. Public users cannot see the real identity of reviewers.
5. Admin approval is required before publishing sensitive submissions.
6. Only approved submissions are visible publicly.
7. Suspicious submissions are flagged or rejected.