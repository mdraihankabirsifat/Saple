-- Read-only SQL*Plus/SQLcl helper for exporting moderator-reviewed salaries.
-- Run from ml/data. The generated salary_training.csv is ignored by Git.
SET ECHO OFF
SET FEEDBACK OFF
SET HEADING ON
SET MARKUP CSV ON DELIMITER , QUOTE ON
SET PAGESIZE 0
SET TRIMSPOOL ON

SPOOL salary_training.csv

SELECT ss.submission_id AS "submission_id",
       ss.role_id AS "role_id",
       jr.role_name AS "role_name",
       ss.base_salary AS "base_salary",
       NVL(ss.additional_compensation, 0) AS "additional_compensation",
       ss.years_of_experience AS "years_of_experience",
       ss.pay_period AS "pay_period",
       ss.employment_type AS "employment_type",
       ss.work_mode AS "work_mode",
       s.verification_status AS "verification_status",
       ss.salary_year AS "salary_year",
       s.submission_status AS "moderation_status"
  FROM submissions s
  JOIN salary_submissions ss ON ss.submission_id = s.submission_id
  JOIN job_roles jr ON jr.role_id = ss.role_id
 WHERE s.submission_type = 'SALARY'
   AND s.submission_status IN ('APPROVED', 'REJECTED')
   AND EXISTS (
       SELECT 1
         FROM moderation_actions ma
        WHERE ma.submission_id = s.submission_id
          AND ma.new_status = s.submission_status
          AND ma.action_type IN ('APPROVE', 'REJECT')
   )
 ORDER BY ss.role_id, ss.submission_id;

SPOOL OFF
SET MARKUP CSV OFF

