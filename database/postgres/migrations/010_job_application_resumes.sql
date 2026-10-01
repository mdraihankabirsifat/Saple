-- Migration 010: optional PDF resume attached to a job application.
--
-- Additive only: one new table, one row per application at most (the
-- application id is the primary key). Existing applications are unchanged and
-- simply have no resume. The PDF is stored in PostgreSQL as BYTEA, never in a
-- public storage bucket, and is read only through the authorised resume
-- endpoints. Re-running this file is harmless.

BEGIN;

-- JOB_APPLICATION_RESUMES keeps the applicant's PDF apart from the
-- application row, so ordinary application lists never read the file.
CREATE TABLE IF NOT EXISTS job_application_resumes (
    application_id     BIGINT NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    mime_type          VARCHAR(100) NOT NULL,
    file_size_bytes    INTEGER NOT NULL,
    sha256_hex         CHAR(64) NOT NULL,
    pdf_data           BYTEA NOT NULL,
    uploaded_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_job_application_resumes PRIMARY KEY (application_id),
    CONSTRAINT fk_job_application_resume_application FOREIGN KEY (application_id)
        REFERENCES job_applications (application_id) ON DELETE CASCADE,
    CONSTRAINT ck_job_application_resume_name CHECK (TRIM(original_file_name) <> ''),
    CONSTRAINT ck_job_application_resume_mime CHECK (mime_type = 'application/pdf'),
    CONSTRAINT ck_job_application_resume_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 2097152),
    CONSTRAINT ck_job_application_resume_length CHECK (OCTET_LENGTH(pdf_data) = file_size_bytes),
    CONSTRAINT ck_job_application_resume_sha256 CHECK (sha256_hex ~ '^[0-9a-f]{64}$')
);

-- Supabase browser roles get no direct access to the new table.
DO $saple_security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    END IF;
END
$saple_security$;

COMMIT;
