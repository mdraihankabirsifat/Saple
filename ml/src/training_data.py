"""Read only final, human-reviewed, non-synthetic public contributions."""

from __future__ import annotations

from collections import Counter

import pandas as pd

FINAL_LABELS = {"APPROVED": 0, "REJECTED": 1}
DEMO_HASH_MARKERS = ("SAPLE.BULK.DEMO.ACCOUNT.NO.LOGIN", "DEMO_HASH_NOT_FOR_PRODUCTION")
DEMO_EMAIL_SUFFIXES = ("@example.invalid", "@example.test")

QUERIES = {
    "SALARY": """SELECT v.submission_id, v.submission_status, v.updated_at,
      ss.role_id, ss.base_salary, ss.additional_compensation, ss.years_of_experience,
      ss.salary_year, ss.pay_period, ss.employment_type, ss.work_mode, v.verification_status
      FROM vw_ml_human_reviewed_real_submissions v
      JOIN salary_submissions ss ON ss.submission_id = v.submission_id
      WHERE v.submission_type = 'SALARY' ORDER BY v.updated_at, v.submission_id""",
    "REVIEW": """SELECT v.submission_id, v.submission_status, v.updated_at,
      r.review_title, r.pros, r.cons, r.advice_to_management
      FROM vw_ml_human_reviewed_real_submissions v
      JOIN company_reviews r ON r.submission_id = v.submission_id
      WHERE v.submission_type = 'REVIEW' ORDER BY v.updated_at, v.submission_id""",
    "INTERVIEW": """SELECT v.submission_id, v.submission_status, v.updated_at,
      i.process_description, i.questions_summary
      FROM vw_ml_human_reviewed_real_submissions v
      JOIN interview_experiences i ON i.submission_id = v.submission_id
      WHERE v.submission_type = 'INTERVIEW' ORDER BY v.updated_at, v.submission_id""",
}


def is_synthetic(row: dict) -> bool:
    """Defense in depth for exports that bypass the SQL training view."""
    email = str(row.get("email") or "").lower()
    password_hash = str(row.get("password_hash") or "")
    return email.endswith(DEMO_EMAIL_SUFFIXES) or any(marker in password_hash for marker in DEMO_HASH_MARKERS)


def final_real_rows(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Exclude provisional, pending and synthetic rows before deriving labels."""
    raw = frame.copy()
    raw.columns = [str(column).lower() for column in raw.columns]
    if "submission_status" not in raw.columns:
        raise ValueError("submission_status is required")
    final = raw[raw["submission_status"].isin(FINAL_LABELS)].copy()
    excluded = 0
    if "email" in final.columns or "password_hash" in final.columns:
        synthetic = final.apply(lambda row: is_synthetic(row.to_dict()), axis=1)
        excluded = int(synthetic.sum())
        final = final[~synthetic].copy()
    final["label"] = final["submission_status"].map(FINAL_LABELS).astype("int64")
    counts = Counter(final["submission_status"])
    report = {
        "totalFinalReviewed": int(len(raw[raw["submission_status"].isin(FINAL_LABELS)])),
        "syntheticExcluded": excluded,
        "realUsed": int(len(final)),
        "approved": int(counts["APPROVED"]),
        "rejected": int(counts["REJECTED"]),
    }
    return final.reset_index(drop=True), report


def fetch_reviewed(connection, content_type: str) -> pd.DataFrame:
    """The connection should use a read-only PostgreSQL role."""
    query = QUERIES[content_type]
    with connection.cursor() as cursor:
        cursor.execute(query)
        columns = [column.name for column in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)
