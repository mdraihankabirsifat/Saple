"""Read-only audit of real final human labels; never trains or mutates data."""

import json
import os

from .training_data import QUERIES, fetch_reviewed, final_real_rows


def audit(connection) -> dict:
    result = {}
    for content_type in QUERIES:
        frame = fetch_reviewed(connection, content_type)
        _, counts = final_real_rows(frame)
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*)::int FROM submissions s
                WHERE s.submission_type = %s AND s.submission_status IN ('APPROVED','REJECTED')
            """, (content_type,))
            all_final = cursor.fetchone()[0]
        counts["totalFinalReviewed"] = all_final
        counts["syntheticExcluded"] = all_final - counts["realUsed"]
        counts["trainable"] = counts["realUsed"] >= 50 and min(counts["approved"], counts["rejected"]) >= 2
        counts["autoPublishSampleEligible"] = counts["realUsed"] >= 200 and min(counts["approved"], counts["rejected"]) >= 30
        if content_type == "SALARY" and not frame.empty:
            counts["roleCount"] = int(frame["role_id"].nunique())
        result[content_type] = counts
    return result


def main() -> int:
    url = os.environ.get("ML_DATABASE_URL")
    if not url:
        raise SystemExit("ML_DATABASE_URL is required (use a read-only database role)")
    import psycopg

    with psycopg.connect(url, options="-c default_transaction_read_only=on") as connection:
        print(json.dumps(audit(connection), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
