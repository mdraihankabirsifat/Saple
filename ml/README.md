# Saple optional ML moderation-risk demo

This folder is a small, removable extension to Saple's database project. It demonstrates how an explainable model could assist salary-submission moderation without changing the Oracle schema, Node backend, frontend, or existing moderation workflow.

The model reports **moderation risk**, not whether a submission is definitively fake. It never approves, rejects, flags, deletes, or otherwise changes a submission. A human moderator remains the final authority.

## Activation and safety rules

Training is role-specific. A role is eligible only when its CSV contains at least **50 final moderator-reviewed salary submissions** and both training classes exist.

| Reviewed role data | Result |
|---|---|
| Fewer than 50 `APPROVED`/`REJECTED` rows | Disabled: `INSUFFICIENT_DATA` |
| At least 50 rows but only one label | Disabled: `INSUFFICIENT_CLASS_DIVERSITY` |
| At least 50 rows and both labels | Eligible to train for that role only |

`PENDING` and `FLAGGED` rows are excluded before the reviewed count. A flag is not treated as final truth.

## Labels and features

The final Oracle submission status becomes the binary training label:

- `APPROVED` -> `0` (legitimate example)
- `REJECTED` -> `1` (suspicious example)
- `FLAGGED` and `PENDING` -> excluded

The pipeline uses eight small, explainable fields already present in Saple:

- Numeric: `base_salary`, `additional_compensation`, `years_of_experience`, `salary_year`
- Categorical: `pay_period`, `employment_type`, `work_mode`, `verification_status`

Numeric values receive median imputation and standard scaling. Categorical values receive most-frequent imputation and one-hot encoding with unknown categories ignored. A `ColumnTransformer` keeps preprocessing together with a class-balanced scikit-learn `LogisticRegression` in one `Pipeline`.

## Dataset format

Input is a CSV with these columns:

```text
submission_id
role_id
role_name
base_salary
additional_compensation
years_of_experience
pay_period
employment_type
work_mode
verification_status
salary_year
moderation_status
```

The read-only [data/export_reviewed_salary.sql](data/export_reviewed_salary.sql) helper can export final moderator-reviewed salary rows from Oracle through SQL*Plus or SQLcl. Run it from `ml/data/` so it writes `salary_training.csv` there. CSV files in that folder are ignored by Git; inspect exports for privacy before moving or sharing them. Never commit private production data.

## Setup on Windows

Run all commands from the `ml` folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

For Command Prompt, activate with:

```bat
.venv\Scripts\activate.bat
```

## Synthetic classroom demo

The live database may not yet have 50 reviewed examples for one role. Generate 100 fictional Software Engineer records (80 approved, 20 rejected) without touching Oracle:

```powershell
python -m src.generate_demo_data --output data/salary_training.csv
```

The file is explicitly printed as `SYNTHETIC DEMO DATA`. Its patterns and model accuracy are designed only to exercise the pipeline; they are not evidence of real-world performance.

## Train and evaluate

Train role 1:

```powershell
python -m src.train --data data/salary_training.csv --role-id 1
```

The command filters role 1, enforces the 50-row and two-class rules, makes a reproducible 80/20 split (`random_state=42`), trains Logistic Regression, prints metrics, and saves `models/role_1_logistic_regression.joblib`. Generated model files are ignored by Git and can be regenerated.

Evaluation reports:

- Accuracy
- Precision
- Recall
- F1 score
- Confusion matrix (`[[true 0/predicted 0, true 0/predicted 1], [true 1/predicted 0, true 1/predicted 1]]`)

For potentially imbalanced suspicious examples, precision, recall, and F1 are more informative than accuracy alone. None of these demo metrics imply production readiness.

## Predict one moderation-risk score

After training role 1:

```powershell
python -m src.predict --role-id 1 --base-salary 300000 --additional-compensation 0 --years-of-experience 1.5 --pay-period MONTHLY --employment-type FULL_TIME --work-mode REMOTE --verification-status UNVERIFIED --salary-year 2026
```

Example output shape:

```json
{
  "eligible": true,
  "roleId": 1,
  "reviewedSamples": 100,
  "suspiciousProbability": 0.82,
  "riskLevel": "HIGH"
}
```

Risk bands are demonstration thresholds only:

- Probability below `0.40`: `LOW`
- Probability from `0.40` to below `0.70`: `MEDIUM`
- Probability at or above `0.70`: `HIGH`

Pass `--data data/salary_training.csv` to prediction when diagnosing an untrained role. It can then return `INSUFFICIENT_DATA` or `INSUFFICIENT_CLASS_DIVERSITY`; otherwise, an absent artifact returns `MODEL_NOT_FOUND`.

## Tests

```powershell
python -m unittest discover -s tests -v
```

The lightweight suite checks the below-50 rule, exact-50 eligibility, one-class rejection, preprocessing, probability bounds, and risk-band boundaries.

## Educational notebook

Start Jupyter and open `notebooks/saple_ml_demo.ipynb`:

```powershell
jupyter notebook
```

The notebook walks through loading data, role counts, eligibility, class balance, preprocessing, training, the confusion matrix and metrics, and one example risk score.

## Limitations

- Synthetic data is intentionally simplified and cannot validate real moderation quality.
- A 50-record threshold makes training possible, not necessarily reliable.
- Sparse rejected examples can make metrics unstable; human review remains mandatory.
- Moderator decisions may contain historical bias or inconsistency.
- The model uses no text, user profiling, behavioral tracking, or role-median feature.
- Models can become stale as salaries and job markets change.
- There is no HTTP API, model server, Node/Python bridge, automatic retraining, monitoring, or production deployment.

## Future integration (documentation only)

```text
Oracle reviewed submissions
        |
export training CSV
        |
role has >= 50 final reviewed records and both classes?
        |
NO -> ML disabled
YES -> train/load that role's model
        |
new salary submission
        |
model risk probability + LOW/MEDIUM/HIGH label
        |
admin moderation UI
        |
human moderator makes the final decision
```

A later milestone could expose `risk_probability` and `risk_level` to the admin moderation screen. This prototype deliberately adds no Oracle columns, changes no `SUBMISSIONS` schema, and does not call Python from Node.

