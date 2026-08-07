"""CSV loading, validation, and role eligibility checks."""

from pathlib import Path

import pandas as pd

from .config import (
    FINAL_MODERATION_STATUSES,
    LABEL_MAPPING,
    MIN_REVIEWED_SAMPLES,
    REQUIRED_COLUMNS,
)


class DatasetValidationError(ValueError):
    """Raised when an input CSV does not follow the documented dataset format."""


def validate_dataset(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Return a normalized copy after checking the required columns."""
    normalized = dataframe.copy()
    normalized.columns = [str(column).strip().lower() for column in normalized.columns]

    missing_columns = [
        column for column in REQUIRED_COLUMNS if column not in normalized.columns
    ]
    if missing_columns:
        missing = ", ".join(missing_columns)
        raise DatasetValidationError(f"Missing required columns: {missing}")

    normalized["role_id"] = pd.to_numeric(normalized["role_id"], errors="coerce")
    if normalized["role_id"].isna().any():
        raise DatasetValidationError("role_id must contain only numeric values")

    normalized["moderation_status"] = (
        normalized["moderation_status"].astype("string").str.strip().str.upper()
    )
    return normalized


def load_dataset(path: str | Path) -> pd.DataFrame:
    """Load and validate a reviewed salary CSV."""
    data_path = Path(path)
    if not data_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {data_path}")
    return validate_dataset(pd.read_csv(data_path))


def prepare_role_training_data(
    dataframe: pd.DataFrame, role_id: int
) -> tuple[pd.DataFrame, pd.Series, dict]:
    """Filter one role, map final decisions, and enforce training rules."""
    normalized = validate_dataset(dataframe)
    role_rows = normalized.loc[normalized["role_id"] == int(role_id)].copy()
    reviewed = role_rows.loc[
        role_rows["moderation_status"].isin(FINAL_MODERATION_STATUSES)
    ].copy()
    labels = reviewed["moderation_status"].map(LABEL_MAPPING).astype("int64")

    status = {
        "eligible": False,
        "roleId": int(role_id),
        "reviewedSamples": int(len(reviewed)),
    }

    if len(reviewed) < MIN_REVIEWED_SAMPLES:
        status.update(
            reason="INSUFFICIENT_DATA",
            message="Insufficient training data",
        )
        return reviewed, labels, status

    if labels.nunique() < 2:
        status.update(
            reason="INSUFFICIENT_CLASS_DIVERSITY",
            message="Insufficient class diversity",
        )
        return reviewed, labels, status

    status["eligible"] = True
    return reviewed, labels, status


def assess_role_eligibility(dataframe: pd.DataFrame, role_id: int) -> dict:
    """Return the public eligibility result without exposing training rows."""
    _, _, status = prepare_role_training_data(dataframe, role_id)
    return status

