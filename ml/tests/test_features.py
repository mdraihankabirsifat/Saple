"""Lightweight tests for eligibility, preprocessing, and risk prediction."""

import unittest

import pandas as pd

from src.config import FEATURE_COLUMNS
from src.data_loader import assess_role_eligibility, prepare_role_training_data
from src.features import build_pipeline, feature_frame, risk_level
from src.predict import predict_risk


def make_dataset(records: int, rejected: int) -> pd.DataFrame:
    rows = []
    for index in range(records):
        is_rejected = index < rejected
        rows.append(
            {
                "submission_id": index + 1,
                "role_id": 1,
                "role_name": "Software Engineer",
                "base_salary": 300000 if is_rejected else 80000 + index * 500,
                "additional_compensation": 0 if is_rejected else 10000,
                "years_of_experience": float(index % 10),
                "pay_period": "MONTHLY",
                "employment_type": "FULL_TIME",
                "work_mode": "REMOTE" if index % 2 else "HYBRID",
                "verification_status": "UNVERIFIED" if is_rejected else "VERIFIED",
                "salary_year": 2026,
                "moderation_status": "REJECTED" if is_rejected else "APPROVED",
            }
        )
    return pd.DataFrame(rows)


class EligibilityTests(unittest.TestCase):
    def test_fewer_than_50_records_disables_training(self):
        result = assess_role_eligibility(make_dataset(49, 10), role_id=1)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["reason"], "INSUFFICIENT_DATA")
        self.assertEqual(result["reviewedSamples"], 49)

    def test_exactly_50_records_with_both_classes_is_eligible(self):
        result = assess_role_eligibility(make_dataset(50, 10), role_id=1)
        self.assertTrue(result["eligible"])
        self.assertEqual(result["reviewedSamples"], 50)

    def test_one_class_dataset_is_disabled(self):
        result = assess_role_eligibility(make_dataset(50, 0), role_id=1)
        self.assertFalse(result["eligible"])
        self.assertEqual(result["reason"], "INSUFFICIENT_CLASS_DIVERSITY")


class FeatureAndPredictionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        reviewed, labels, _ = prepare_role_training_data(
            make_dataset(60, 12), role_id=1
        )
        cls.pipeline = build_pipeline()
        cls.pipeline.fit(reviewed[FEATURE_COLUMNS], labels)
        cls.record = {
            "base_salary": 90000,
            "additional_compensation": 12000,
            "years_of_experience": 2.5,
            "pay_period": "MONTHLY",
            "employment_type": "FULL_TIME",
            "work_mode": "REMOTE",
            "verification_status": "VERIFIED",
            "salary_year": 2026,
        }

    def test_feature_preprocessing_works(self):
        transformed = self.pipeline.named_steps["preprocessor"].transform(
            feature_frame(self.record)
        )
        self.assertEqual(transformed.shape[0], 1)
        self.assertGreater(transformed.shape[1], len(FEATURE_COLUMNS))

    def test_prediction_probability_is_bounded(self):
        result = predict_risk(
            {
                "pipeline": self.pipeline,
                "roleId": 1,
                "reviewedSamples": 60,
            },
            self.record,
        )
        self.assertGreaterEqual(result["suspiciousProbability"], 0.0)
        self.assertLessEqual(result["suspiciousProbability"], 1.0)
        self.assertIn(result["riskLevel"], ("LOW", "MEDIUM", "HIGH"))

    def test_risk_level_mapping(self):
        self.assertEqual(risk_level(0.0), "LOW")
        self.assertEqual(risk_level(0.3999), "LOW")
        self.assertEqual(risk_level(0.40), "MEDIUM")
        self.assertEqual(risk_level(0.6999), "MEDIUM")
        self.assertEqual(risk_level(0.70), "HIGH")
        self.assertEqual(risk_level(1.0), "HIGH")


if __name__ == "__main__":
    unittest.main()

