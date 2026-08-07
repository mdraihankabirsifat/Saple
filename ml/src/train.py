"""Train one eligible, role-specific salary moderation-risk model."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.model_selection import train_test_split

from .config import (
    FEATURE_COLUMNS,
    LABEL_MAPPING,
    MODEL_FILENAME,
    RANDOM_STATE,
    TEST_SIZE,
)
from .data_loader import load_dataset, prepare_role_training_data
from .evaluate import evaluate_classifier
from .features import build_pipeline


def split_for_evaluation(features: pd.DataFrame, labels: pd.Series):
    """Split reproducibly, stratifying whenever each class has two samples."""
    stratify = labels if labels.value_counts().min() >= 2 else None
    train_features, test_features, train_labels, test_labels = train_test_split(
        features,
        labels,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=stratify,
    )

    # A singleton minority sample can land in the test set without stratification.
    # Move it into training so Logistic Regression still sees both classes.
    missing_classes = set(labels.unique()) - set(train_labels.unique())
    for missing_class in missing_classes:
        index = test_labels.loc[test_labels == missing_class].index[0]
        train_features = pd.concat([train_features, test_features.loc[[index]]])
        train_labels = pd.concat([train_labels, test_labels.loc[[index]]])
        test_features = test_features.drop(index=index)
        test_labels = test_labels.drop(index=index)

    return train_features, test_features, train_labels, test_labels


def train_role_model(
    data_path: str | Path, role_id: int, model_dir: str | Path = "models"
) -> dict:
    """Train and save a model, or return a clean ineligibility result."""
    dataframe = load_dataset(data_path)
    reviewed, labels, status = prepare_role_training_data(dataframe, role_id)
    if not status["eligible"]:
        return status

    features = reviewed[FEATURE_COLUMNS]
    train_features, test_features, train_labels, test_labels = (
        split_for_evaluation(features, labels)
    )

    pipeline = build_pipeline()
    pipeline.fit(train_features, train_labels)
    metrics = evaluate_classifier(pipeline, test_features, test_labels)

    role_names = reviewed["role_name"].dropna().astype(str)
    role_name = role_names.iloc[0] if not role_names.empty else f"Role {role_id}"
    artifact = {
        "pipeline": pipeline,
        "roleId": int(role_id),
        "roleName": role_name,
        "reviewedSamples": int(len(reviewed)),
        "features": FEATURE_COLUMNS,
        "labelMapping": LABEL_MAPPING,
        "riskThresholds": {"lowBelow": 0.40, "highAtOrAbove": 0.70},
        "trainedAtUtc": datetime.now(timezone.utc).isoformat(),
    }

    destination = Path(model_dir)
    destination.mkdir(parents=True, exist_ok=True)
    model_path = destination / MODEL_FILENAME.format(role_id=int(role_id))
    joblib.dump(artifact, model_path)

    return {
        **status,
        "roleName": role_name,
        "model": "LogisticRegression",
        "trainSamples": int(len(train_features)),
        "testSamples": int(len(test_features)),
        "metrics": metrics,
        "modelPath": str(model_path),
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train a role-specific Saple salary moderation-risk model."
    )
    parser.add_argument("--data", required=True, help="Reviewed salary CSV path")
    parser.add_argument("--role-id", required=True, type=int)
    parser.add_argument("--model-dir", default="models")
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    result = train_role_model(args.data, args.role_id, args.model_dir)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
