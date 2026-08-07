"""Shared configuration for the Saple ML demonstration module."""

MIN_REVIEWED_SAMPLES = 50
RANDOM_STATE = 42
TEST_SIZE = 0.20

FINAL_MODERATION_STATUSES = ("APPROVED", "REJECTED")
LABEL_MAPPING = {"APPROVED": 0, "REJECTED": 1}

NUMERIC_FEATURES = [
    "base_salary",
    "additional_compensation",
    "years_of_experience",
    "salary_year",
]

CATEGORICAL_FEATURES = [
    "pay_period",
    "employment_type",
    "work_mode",
    "verification_status",
]

FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

REQUIRED_COLUMNS = [
    "submission_id",
    "role_id",
    "role_name",
    *FEATURE_COLUMNS,
    "moderation_status",
]

MODEL_FILENAME = "role_{role_id}_logistic_regression.joblib"

