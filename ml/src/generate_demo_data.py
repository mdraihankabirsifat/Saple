"""Generate fictional data solely for demonstrating the isolated ML pipeline."""

import argparse
import random
from pathlib import Path

import pandas as pd


def generate_demo_dataset(records: int = 100, seed: int = 42) -> pd.DataFrame:
    """Create 80+ fictional role-1 salaries with both final label classes."""
    if records < 80:
        raise ValueError("Synthetic demo data must contain at least 80 records")

    randomizer = random.Random(seed)
    rows = []
    for offset in range(records):
        suspicious = offset % 5 == 0
        experience = round(randomizer.uniform(0.2, 12.0), 1)
        expected_salary = 50000 + experience * 8500
        if suspicious:
            multiplier = randomizer.choice((0.25, 2.8, 3.4))
            base_salary = round(expected_salary * multiplier, 2)
            verification_status = randomizer.choice(("UNVERIFIED", "PENDING"))
            moderation_status = "REJECTED"
        else:
            base_salary = round(expected_salary * randomizer.uniform(0.85, 1.18), 2)
            verification_status = randomizer.choice(("VERIFIED", "VERIFIED", "UNVERIFIED"))
            moderation_status = "APPROVED"

        rows.append(
            {
                "submission_id": 10001 + offset,
                "role_id": 1,
                "role_name": "Software Engineer",
                "base_salary": base_salary,
                "additional_compensation": round(
                    randomizer.uniform(0, base_salary * (0.08 if suspicious else 0.22)), 2
                ),
                "years_of_experience": experience,
                "pay_period": "MONTHLY",
                "employment_type": randomizer.choice(
                    ("FULL_TIME", "FULL_TIME", "CONTRACT", "INTERN")
                ),
                "work_mode": randomizer.choice(("ONSITE", "HYBRID", "REMOTE")),
                "verification_status": verification_status,
                "salary_year": randomizer.choice((2024, 2025, 2026)),
                "moderation_status": moderation_status,
            }
        )
    return pd.DataFrame(rows)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate SYNTHETIC DEMO DATA; never insert it into Oracle."
    )
    parser.add_argument("--output", default="data/salary_training.csv")
    parser.add_argument("--records", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    return parser


def main() -> int:
    args = _build_parser().parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dataframe = generate_demo_dataset(args.records, args.seed)
    dataframe.to_csv(output_path, index=False)
    counts = dataframe["moderation_status"].value_counts().to_dict()
    print("SYNTHETIC DEMO DATA")
    print(f"Wrote {len(dataframe)} fictional records to {output_path}")
    print(f"Class counts: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

