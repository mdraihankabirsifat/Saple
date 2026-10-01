"""FastAPI inference endpoint for separately deployed Saple ML models."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from secrets import compare_digest
from typing import Any, Literal

import joblib
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.train_all import SALARY_CATEGORY, SALARY_NUMERIC, SCHEMA_VERSION, TEXT_FIELDS

ContentType = Literal["SALARY", "REVIEW", "INTERVIEW", "JOB", "PROFILE", "COMPANY"]


class ScreenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contentType: ContentType
    featureSchemaVersion: str = Field(max_length=80)
    features: dict[str, Any]

    @field_validator("features")
    @classmethod
    def bounded_fields(cls, value):
        if len(value) > 24 or len(str(value)) > 16000:
            raise ValueError("Screening input is too large")
        return value


def require_token(x_saple_ml_token: str | None = Header(default=None)) -> None:
    configured = os.environ.get("ML_SERVICE_TOKEN")
    if not configured or not x_saple_ml_token or not compare_digest(x_saple_ml_token, configured):
        raise HTTPException(status_code=401, detail="Service authentication required")


def manual(content_type: ContentType, reason: str, *, model_key=None, model_version=None) -> dict:
    return {"eligible": False, "contentType": content_type, "decision": "MANUAL_REVIEW",
            "modelKey": model_key, "modelVersion": model_version,
            "featureSchemaVersion": SCHEMA_VERSION,
            "riskProbability": None, "autoPublishThreshold": None,
            "outOfDistribution": True, "reasonCodes": [reason]}


def load_active_models(connection=None) -> tuple[dict[str, dict], dict[str, str]]:
    """Load only ACTIVE registry entries from a private, hash-verified directory."""
    models: dict[str, dict] = {}
    errors: dict[str, str] = {}
    directory = Path(os.environ.get("ML_MODEL_DIR", "models")).resolve()
    if connection is None:
        return models, errors
    with connection.cursor() as cursor:
        cursor.execute("""SELECT model_key, model_version, artifact_uri, artifact_sha256,
            feature_schema_version, auto_publish_threshold
            FROM ml_model_registry WHERE status = 'ACTIVE'""")
        columns = [column.name for column in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    for row in rows:
        key = row["model_key"]
        try:
            artifact_path = Path(row["artifact_uri"]).resolve()
            if not artifact_path.is_relative_to(directory) or artifact_path.suffix != ".joblib":
                raise ValueError("ARTIFACT_PATH_INVALID")
            if hashlib.sha256(artifact_path.read_bytes()).hexdigest() != row["artifact_sha256"]:
                raise ValueError("ARTIFACT_HASH_MISMATCH")
            artifact = joblib.load(artifact_path)
            if artifact.get("modelKey") != key or artifact.get("modelVersion") != row["model_version"]:
                raise ValueError("ARTIFACT_METADATA_MISMATCH")
            if artifact.get("featureSchemaVersion") != row["feature_schema_version"]:
                raise ValueError("SCHEMA_MISMATCH")
            artifact["autoPublishThreshold"] = float(row["auto_publish_threshold"]) if row["auto_publish_threshold"] is not None else None
            models[key] = artifact
        except (OSError, ValueError, KeyError, TypeError):
            errors[key] = "MODEL_ARTIFACT_UNAVAILABLE"
    return models, errors


def evaluate(payload: ScreenRequest, models: dict[str, dict], errors: dict[str, str] | None = None) -> dict:
    content_type = payload.contentType
    if payload.featureSchemaVersion != SCHEMA_VERSION:
        return manual(content_type, "SCHEMA_MISMATCH")
    if content_type == "SALARY":
        role = payload.features.get("roleId")
        if not isinstance(role, int) or role < 1:
            return manual(content_type, "UNKNOWN_CATEGORY")
        key = f"salary-role-{role}"
    else:
        key = f"{content_type.lower()}-global"
    artifact = models.get(key)
    if not artifact:
        return manual(content_type, (errors or {}).get(key, "INSUFFICIENT_MODEL_DATA"), model_key=key)
    if artifact.get("featureSchemaVersion") != SCHEMA_VERSION:
        return manual(content_type, "SCHEMA_MISMATCH", model_key=key)
    trained = pd.Timestamp(artifact.get("trainedAtUtc"))
    if (pd.Timestamp.now(tz="UTC") - trained).days > 90:
        return manual(content_type, "STALE_MODEL", model_key=key, model_version=artifact.get("modelVersion"))
    try:
        if content_type == "SALARY":
            fields = {"base_salary": payload.features["baseSalary"],
                      "additional_compensation": payload.features.get("additionalCompensation"),
                      "years_of_experience": payload.features["yearsOfExperience"],
                      "salary_year": payload.features["salaryYear"],
                      "pay_period": payload.features["payPeriod"],
                      "employment_type": payload.features["employmentType"],
                      "work_mode": payload.features["workMode"],
                      "verification_status": "VERIFIED"}
            if any(str(fields[key]) not in artifact["knownCategories"].get(key, []) for key in SALARY_CATEGORY):
                return manual(content_type, "UNKNOWN_CATEGORY", model_key=key)
            bounds = artifact.get("salaryBounds")
            if bounds and not (bounds[0] * 0.5 <= float(fields["base_salary"]) <= bounds[1] * 1.5):
                return manual(content_type, "OUT_OF_DISTRIBUTION", model_key=key)
            features = pd.DataFrame([fields], columns=SALARY_NUMERIC + SALARY_CATEGORY)
        elif content_type in TEXT_FIELDS:
            text = " ".join(str(payload.features.get(field, "") or "") for field in TEXT_FIELDS[content_type]).strip()
            bounds = artifact.get("textLengthBounds")
            if len(text) < 20 or (bounds and not (max(20, bounds[0] // 2) <= len(text) <= max(200, bounds[1] * 2))):
                return manual(content_type, "OUT_OF_DISTRIBUTION", model_key=key)
            if len(text.split()) < 5:
                return manual(content_type, "LOW_RELEVANCE", model_key=key)
            features = [text]
        else:
            return manual(content_type, "INSUFFICIENT_MODEL_DATA", model_key=key)
        risk = float(artifact["pipeline"].predict_proba(features)[0, 1])
    except (KeyError, ValueError, TypeError):
        return manual(content_type, "OUT_OF_DISTRIBUTION", model_key=key)
    threshold = artifact.get("autoPublishThreshold")
    eligible = bool(artifact.get("autoPublishEligible") and threshold is not None and risk <= threshold)
    return {"eligible": eligible, "contentType": content_type,
            "modelKey": key, "modelVersion": artifact["modelVersion"],
            "featureSchemaVersion": SCHEMA_VERSION, "riskProbability": risk,
            "autoPublishThreshold": threshold, "outOfDistribution": False,
            "decision": "AUTO_PUBLISH" if eligible else "MANUAL_REVIEW",
            "reasonCodes": [] if eligible else ["NEEDS_MANUAL_REVIEW"]}


app = FastAPI(title="Saple moderation screening", docs_url=None, redoc_url=None, openapi_url=None)
ACTIVE: dict[str, dict] = {}
LOAD_ERRORS: dict[str, str] = {}


@app.on_event("startup")
def startup() -> None:
    url = os.environ.get("ML_DATABASE_URL")
    if not url:
        return
    try:
        import psycopg
        with psycopg.connect(url, options="-c default_transaction_read_only=on") as connection:
            models, errors = load_active_models(connection)
            ACTIVE.clear(); ACTIVE.update(models)
            LOAD_ERRORS.clear(); LOAD_ERRORS.update(errors)
    except Exception:
        # No raw connection string, exception or model path enters logs/API.
        ACTIVE.clear()
        LOAD_ERRORS.clear()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "activeModels": len(ACTIVE), "unavailableModels": len(LOAD_ERRORS)}


@app.post("/screen", dependencies=[Depends(require_token)])
def screen(payload: ScreenRequest) -> dict:
    return evaluate(payload, ACTIVE, LOAD_ERRORS)
