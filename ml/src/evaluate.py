"""Small evaluation helper for the role-specific classifier."""

from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)


def evaluate_classifier(model, features, labels) -> dict:
    """Return JSON-friendly binary classification metrics."""
    predictions = model.predict(features)
    return {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "confusionMatrix": confusion_matrix(
            labels, predictions, labels=[0, 1]
        ).astype(int).tolist(),
    }
