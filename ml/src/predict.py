"""Score one salary submission with an already trained role model."""

import argparse
import json
from pathlib import Path

import joblib

from .config import MODEL_FILENAME
from .data_loader import assess_role_eligibility, load_dataset
from .features import feature_frame, risk_level


def predict_risk(artifact: dict, record: dict) -> dict:
    """Return suspicious probability and a non-final moderation risk label."""
    pipeline = artifact["pipeline"]
    model_input = feature_frame(record)
    probabilities = pipeline.predict_proba(model_input)[0]
    positive_index = list(pipeline.classes_).index(1)
    suspicious_probability = float(probabilities[positive_index])
    return {
        "eligible": True,
        "roleId": int(artifact["roleId"]),
        "reviewedSamples": int(artifact["reviewedSamples"]),
        "suspiciousProbability": suspicious_probability,
        "riskLevel": risk_level(suspicious_probability),
    }


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Produce a demonstration moderation-risk score."
    )
    parser.add_argument("--role-id", required=True, type=int)
    parser.add_argument("--model-dir", default="models")
    parser.add_argument(
        "--data",
        help="Optional reviewed CSV used to explain why an untrained role is disabled",
    )
    parser.add_argument("--base-salary", required=True, type=float)
    parser.add_argument("--additional-compensation", type=float, default=0.0)
    parser.add_argument("--years-of-experience", required=True, type=float)
    parser.add_argument("--pay-period", required=True, choices=("MONTHLY", "YEARLY"))
    parser.add_argument(
        "--employment-type",
        required=True,
        choices=("FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"),
    )
    parser.add_argument(
        "--work-mode", required=True, choices=("ONSITE", "HYBRID", "REMOTE")
    )
    parser.add_argument(
        "--verification-status",
        required=True,
        choices=("VERIFIED", "UNVERIFIED", "PENDING", "REJECTED"),
    )
    parser.add_argument("--salary-year", required=True, type=int)
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    model_path = Path(args.model_dir) / MODEL_FILENAME.format(role_id=args.role_id)

    if not model_path.is_file():
        if args.data:
            eligibility = assess_role_eligibility(load_dataset(args.data), args.role_id)
            if not eligibility["eligible"]:
                print(json.dumps(eligibility, indent=2))
                return 0
        print(
            json.dumps(
                {
                    "eligible": False,
                    "roleId": args.role_id,
                    "reason": "MODEL_NOT_FOUND",
                    "message": "No trained role model is available",
                },
                indent=2,
            )
        )
        return 0

    artifact = joblib.load(model_path)
    if int(artifact["roleId"]) != args.role_id:
        raise ValueError("The model artifact does not match the requested role")

    record = {
        "base_salary": args.base_salary,
        "additional_compensation": args.additional_compensation,
        "years_of_experience": args.years_of_experience,
        "pay_period": args.pay_period,
        "employment_type": args.employment_type,
        "work_mode": args.work_mode,
        "verification_status": args.verification_status,
        "salary_year": args.salary_year,
    }
    print(json.dumps(predict_risk(artifact, record), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

