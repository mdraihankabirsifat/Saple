"""Explainable feature preprocessing and risk-level helpers."""

from collections.abc import Mapping

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .config import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
    RANDOM_STATE,
)


def build_pipeline() -> Pipeline:
    """Build preprocessing and Logistic Regression as one reusable pipeline."""
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("one_hot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )
    classifier = LogisticRegression(
        class_weight="balanced",
        max_iter=1000,
        random_state=RANDOM_STATE,
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )


def feature_frame(record: Mapping) -> pd.DataFrame:
    """Convert one prediction record into the model's expected feature frame."""
    missing = [column for column in FEATURE_COLUMNS if column not in record]
    if missing:
        raise ValueError(f"Missing prediction features: {', '.join(missing)}")
    return pd.DataFrame([{column: record[column] for column in FEATURE_COLUMNS}])


def risk_level(probability: float) -> str:
    """Map a suspicious probability to demonstration-only risk bands."""
    if not 0.0 <= probability <= 1.0:
        raise ValueError("Probability must be between 0 and 1")
    if probability < 0.40:
        return "LOW"
    if probability < 0.70:
        return "MEDIUM"
    return "HIGH"

