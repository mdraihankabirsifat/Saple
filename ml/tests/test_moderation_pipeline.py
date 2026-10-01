import hashlib
import unittest

import pandas as pd

from src.train_all import dataset_fingerprint, select_threshold
from src.training_data import final_real_rows, is_synthetic


class ModerationDataTests(unittest.TestCase):
    def test_only_final_human_labels_are_used(self):
        frame = pd.DataFrame([
            {"submission_id": 1, "submission_status": "APPROVED", "updated_at": "2026-01-01", "email": "real@company.com"},
            {"submission_id": 2, "submission_status": "REJECTED", "updated_at": "2026-01-02", "email": "real@company.com"},
            {"submission_id": 3, "submission_status": "PENDING", "updated_at": "2026-01-03", "email": "real@company.com"},
            {"submission_id": 4, "submission_status": "APPROVED", "updated_at": "2026-01-04", "email": "demo@example.test"},
        ])
        rows, report = final_real_rows(frame)
        self.assertEqual(rows["submission_id"].tolist(), [1, 2])
        self.assertEqual(report["syntheticExcluded"], 1)
        self.assertEqual(report["approved"], 1)
        self.assertEqual(report["rejected"], 1)

    def test_demo_markers_are_defense_in_depth(self):
        self.assertTrue(is_synthetic({"email": "user@example.invalid"}))
        self.assertTrue(is_synthetic({"password_hash": "$2b$10$DEMO_HASH_NOT_FOR_PRODUCTION"}))
        self.assertFalse(is_synthetic({"email": "member@real.example"}))

    def test_fingerprint_is_stable_and_ordered(self):
        frame = pd.DataFrame([
            {"submission_id": 2, "submission_status": "REJECTED", "updated_at": "2026-01-02"},
            {"submission_id": 1, "submission_status": "APPROVED", "updated_at": "2026-01-01"},
        ])
        expected = dataset_fingerprint(frame, "REVIEW")
        self.assertEqual(expected, dataset_fingerprint(frame.iloc[::-1], "REVIEW"))
        self.assertEqual(len(expected), hashlib.sha256().digest_size * 2)

    def test_threshold_requires_enough_holdout_evidence_and_precision(self):
        threshold, report = select_threshold([0] * 19 + [1], [0.01] * 19 + [0.01])
        self.assertIsNone(threshold)
        self.assertEqual(report["falseAutoPublishes"], 0)
        threshold, report = select_threshold([0] * 20, [0.01] * 20)
        self.assertEqual(threshold, 0.01)
        self.assertEqual(report["autoPublishLegitimatePrecision"], 1.0)


if __name__ == "__main__":
    unittest.main()
