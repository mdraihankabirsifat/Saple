"""Train versioned CANDIDATE risk models from final real human labels only.

This command is deliberately manual. It reads via ML_DATABASE_URL, writes
private local artifacts, and never activates auto-publication by itself.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix,
                             f1_score, precision_score, recall_score, average_precision_score,
                             roc_auc_score)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .training_data import QUERIES, fetch_reviewed, final_real_rows

SCHEMA_VERSION = "1"
MIN_TRAIN = 50
MIN_AUTO = 200
MIN_CLASS_AUTO = 30
PRECISION_TARGET = 0.98
MAX_AUTO_RISK = 0.05
SALARY_NUMERIC = ["base_salary", "additional_compensation", "years_of_experience", "salary_year"]
SALARY_CATEGORY = ["pay_period", "employment_type", "work_mode", "verification_status"]
TEXT_FIELDS = {
    "REVIEW": ["review_title", "pros", "cons", "advice_to_management"],
    "INTERVIEW": ["process_description", "questions_summary"],
}


def dataset_fingerprint(frame: pd.DataFrame, content_type: str) -> str:
    """Stable hash of ordered IDs/labels/time and query/schema versions."""
    digest = hashlib.sha256(f"{content_type}|{SCHEMA_VERSION}|query-v1".encode())
    for row in frame.sort_values("submission_id").itertuples(index=False):
        digest.update(f"|{row.submission_id}:{row.submission_status}:{row.updated_at}".encode())
    return digest.hexdigest()


def split_time(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    ordered = frame.sort_values(["updated_at", "submission_id"])
    cutoff = max(1, int(len(ordered) * 0.8))
    train, holdout = ordered.iloc[:cutoff].copy(), ordered.iloc[cutoff:].copy()
    if len(train) >= 40 and len(holdout) >= 10 and train.label.nunique() == 2 and holdout.label.nunique() == 2:
        return train, holdout, "TIME"
    # Reproducible fallback for sparse chronological class distribution.
    from sklearn.model_selection import train_test_split
    train, holdout = train_test_split(frame, test_size=0.2, random_state=42, stratify=frame.label)
    return train, holdout, "STRATIFIED_RANDOM"


def text_value(frame: pd.DataFrame, content_type: str) -> pd.Series:
    return frame[TEXT_FIELDS[content_type]].fillna("").astype(str).agg(" ".join, axis=1).str.strip()


def pipeline_for(content_type: str):
    if content_type == "SALARY":
        preprocess = ColumnTransformer([
            ("numeric", Pipeline([("impute", SimpleImputer(strategy="median")),
                                   ("scale", StandardScaler())]), SALARY_NUMERIC),
            ("category", Pipeline([("impute", SimpleImputer(strategy="most_frequent")),
                                    ("encode", OneHotEncoder(handle_unknown="ignore"))]), SALARY_CATEGORY),
        ])
        return Pipeline([("features", preprocess),
                         ("model", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42))])
    return Pipeline([("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=20000)),
                     ("model", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42))])


def select_threshold(labels, risk) -> tuple[float | None, dict]:
    """Only low-risk thresholds with enough held-out evidence can publish."""
    labels = np.asarray(labels)
    risk = np.asarray(risk)
    best = None
    report = {"autoPublishCoverage": 0.0, "autoPublishLegitimatePrecision": None, "falseAutoPublishes": 0}
    for threshold in sorted(set(float(v) for v in risk if 0 <= v <= MAX_AUTO_RISK)):
        selected = risk <= threshold
        count = int(selected.sum())
        if count < 20:
            continue
        precision = float((labels[selected] == 0).sum() / count)
        if precision >= PRECISION_TARGET:
            best = threshold
            report = {"autoPublishCoverage": float(count / len(labels)),
                      "autoPublishLegitimatePrecision": precision,
                      "falseAutoPublishes": int((labels[selected] == 1).sum())}
    return best, report


def train_candidate(frame: pd.DataFrame, content_type: str, scope: str = "GLOBAL") -> tuple[dict, dict | None]:
    reviewed, counts = final_real_rows(frame)
    metadata = {"contentType": content_type, "scope": scope, "modelKey": f"{content_type.lower()}-{scope.lower()}",
                "featureSchemaVersion": SCHEMA_VERSION, "trainingSampleCount": counts["realUsed"],
                "approvedSampleCount": counts["approved"], "rejectedSampleCount": counts["rejected"]}
    if counts["realUsed"] < MIN_TRAIN or min(counts["approved"], counts["rejected"]) < 2:
        return {**metadata, "eligible": False, "reason": "INSUFFICIENT_MODEL_DATA"}, None
    train, holdout, method = split_time(reviewed)
    x_train = train[SALARY_NUMERIC + SALARY_CATEGORY] if content_type == "SALARY" else text_value(train, content_type)
    x_holdout = holdout[SALARY_NUMERIC + SALARY_CATEGORY] if content_type == "SALARY" else text_value(holdout, content_type)
    pipeline = pipeline_for(content_type)
    pipeline.fit(x_train, train.label)
    risk = pipeline.predict_proba(x_holdout)[:, 1]
    predicted = (risk >= 0.5).astype(int)
    metrics = {
        "accuracy": float(accuracy_score(holdout.label, predicted)),
        "precision": float(precision_score(holdout.label, predicted, zero_division=0)),
        "recall": float(recall_score(holdout.label, predicted, zero_division=0)),
        "f1": float(f1_score(holdout.label, predicted, zero_division=0)),
        "confusionMatrix": confusion_matrix(holdout.label, predicted, labels=[0, 1]).tolist(),
        "brier": float(brier_score_loss(holdout.label, risk)),
        "rocAuc": float(roc_auc_score(holdout.label, risk)) if holdout.label.nunique() == 2 else None,
        "prAuc": float(average_precision_score(holdout.label, risk)) if holdout.label.nunique() == 2 else None,
        "validationSamples": int(len(holdout)), "validationMethod": method,
    }
    threshold, publication = select_threshold(holdout.label, risk)
    metrics.update(publication)
    eligible_auto = counts["realUsed"] >= MIN_AUTO and min(counts["approved"], counts["rejected"]) >= MIN_CLASS_AUTO
    if not eligible_auto:
        threshold = None
    trained_at = datetime.now(timezone.utc).isoformat()
    fingerprint = dataset_fingerprint(reviewed, content_type)
    version = f"{datetime.now(timezone.utc):%Y%m%d}.{fingerprint[:12]}"
    artifact = {**metadata, "pipeline": pipeline, "modelVersion": version,
                "trainingDatasetFingerprint": fingerprint, "trainedAtUtc": trained_at,
                "trainingWindow": [str(reviewed.updated_at.min()), str(reviewed.updated_at.max())],
                "metrics": metrics, "autoPublishThreshold": threshold,
                "autoPublishEligible": threshold is not None,
                "featureColumns": SALARY_NUMERIC + SALARY_CATEGORY if content_type == "SALARY" else TEXT_FIELDS[content_type],
                "knownCategories": {key: sorted(reviewed[key].dropna().astype(str).unique().tolist()) for key in SALARY_CATEGORY}
                if content_type == "SALARY" else {},
                "salaryBounds": [float(reviewed.base_salary.quantile(0.005)), float(reviewed.base_salary.quantile(0.995))]
                if content_type == "SALARY" else None,
                "textLengthBounds": [int(text_value(reviewed, content_type).str.len().quantile(0.005)),
                                     int(text_value(reviewed, content_type).str.len().quantile(0.995))]
                if content_type != "SALARY" else None}
    return {**metadata, "eligible": True, "modelVersion": version, "metrics": metrics,
            "autoPublishEligible": threshold is not None, "autoPublishThreshold": threshold,
            "trainingDatasetFingerprint": fingerprint}, artifact


def save_candidate(artifact: dict, directory: Path) -> dict:
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{artifact['modelKey']}-{artifact['modelVersion']}"
    path = directory / f"{name}.joblib"
    joblib.dump(artifact, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"artifactUri": str(path), "artifactSha256": digest}


def register_candidate(connection, report: dict) -> None:
    """Optional write through a separate registry credential; never activates."""
    with connection.cursor() as cursor:
        cursor.execute("""INSERT INTO ml_model_registry (
            model_key, content_type, scope_key, model_version, artifact_uri,
            artifact_sha256, feature_schema_version, training_dataset_fingerprint,
            trained_at, training_sample_count, approved_sample_count,
            rejected_sample_count, metrics, auto_publish_threshold, status
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP,
                  %s, %s, %s, %s::jsonb, %s, 'CANDIDATE')
        ON CONFLICT (model_key, model_version) DO NOTHING""", (
            report["modelKey"], report["contentType"], report["scope"], report["modelVersion"],
            report["artifactUri"], report["artifactSha256"], report["featureSchemaVersion"],
            report["trainingDatasetFingerprint"], report["trainingSampleCount"],
            report["approvedSampleCount"], report["rejectedSampleCount"],
            json.dumps(report["metrics"]), report["autoPublishThreshold"]
        ))


def main() -> int:
    url = os.environ.get("ML_DATABASE_URL")
    if not url:
        raise SystemExit("ML_DATABASE_URL is required (use a read-only database role)")
    import psycopg

    reports = []
    model_dir = Path(os.environ.get("ML_MODEL_DIR", "models"))
    with psycopg.connect(url, options="-c default_transaction_read_only=on") as connection:
        for content_type in QUERIES:
            data = fetch_reviewed(connection, content_type)
            scopes = [("GLOBAL", data)]
            if content_type == "SALARY" and not data.empty:
                scopes = [(f"role-{int(role)}", group) for role, group in data.groupby("role_id")]
            for scope, group in scopes:
                result, artifact = train_candidate(group, content_type, scope)
                if artifact is not None:
                    result.update(save_candidate(artifact, model_dir))
                    result["status"] = "CANDIDATE"
                reports.append(result)
    registry_url = os.environ.get("ML_REGISTRY_DATABASE_URL")
    if registry_url:
        with psycopg.connect(registry_url) as registry:
            for report in reports:
                if report.get("status") == "CANDIDATE":
                    register_candidate(registry, report)
    print(json.dumps(reports, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
