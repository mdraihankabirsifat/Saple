# Saple ML-assisted moderation

This is a separate, explainable moderation-risk layer. Saple’s Node backend
remains the application authority and human moderators remain final. The
service may return a high-confidence low-risk suggestion, but it never returns
`AUTO_REJECT` and never makes a final moderation decision.

## What is screened

The architecture supports salary submissions, company reviews, interview
experiences, representative-created jobs and public professional-profile text.
Normal validation, authorization, duplicate checks and rate limits run first.
When the service is unavailable or a model is not eligible, the submission is
saved and held for manual review.

The model never receives passwords, JWTs, reset tokens, payment data,
verification evidence, direct messages, application statements, applicant PDF
resumes, CV text, or private email addresses. Images use the existing MIME,
size and magic-byte checks; no biometric or brand classification is performed.

## States and safety controls

Each screening is recorded in `content_screenings` with the model version,
feature schema, probabilities, reason codes and publication state. A low-risk
result can be `PROVISIONAL` only when the model is active, fresh, in
distribution, trained on enough final real labels, the content type is enabled,
`ML_AUTO_PUBLISH_ENABLED=true`, and `ML_SHADOW_MODE=false`.

The emergency kill switch is `ML_AUTO_PUBLISH_ENABLED=false`. Shadow mode is
the default (`ML_SHADOW_MODE=true`): scores are recorded, but every item stays
held. Public provisional content is visibly marked as awaiting moderator review.
Human approval changes it to `CONFIRMED`; rejection changes it to `REMOVED`.
ML retries cannot override a final human decision.

Profile and job changes are revision-safe: a held change is not applied to the
public profile or job, while a provisional change is visible with a pending
review state. Administrators review those revisions from the ML queue and can
confirm or remove them. A profile revision superseded by a newer revision is
never allowed to overwrite the current profile. Company descriptive content is
manual-only until a separate model has enough real labels.

## Training data and models

Training labels are only final human `APPROVED` and `REJECTED` rows. Pending,
flagged, provisional and ML-generated states are excluded. Demo accounts are
excluded both by the SQL view and by defense-in-depth marker checks. Private
content is never exported. Salary models keep role-specific structured
features; review and interview models use small TF-IDF plus LogisticRegression
pipelines when enough labels exist.

The gates are at least 50 real reviewed rows and both classes to train, and at
least 200 real rows with 30 of each class plus valid holdout evidence for
auto-publish. Candidate reports include a deterministic dataset fingerprint,
validation method, metrics, coverage and false auto-publishes. Candidates are
private artifacts and `CANDIDATE` registry rows; training never activates one.

The current training command covers the labelled salary, review and interview
families. JOB, PROFILE and COMPANY remain `MANUAL_REVIEW` only when their
model is absent or fails the eligibility gates; no synthetic model is created
to enable publication.

## Manual commands

Install service dependencies from `ml`:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-service.txt
```

Audit with a read-only database role first:

```powershell
python -m src.audit_training_data
```

After reviewing that report, create private candidate artifacts:

```powershell
python -m src.train_all
```

Run the separate service with `uvicorn service.app:app --host 0.0.0.0 --port 8000`.
Set `ML_SERVICE_URL` and `ML_SERVICE_TOKEN` only in backend runtime settings.
The browser never receives the service token. `/health` is safe to expose;
`/screen` requires the token and strict Pydantic input. `ml/Dockerfile` is the
container deployment baseline.

Administrators can inspect pending screening metadata at
`GET /api/admin/ml/screenings/pending` and record a human decision for profile
or job revisions with `PATCH /api/admin/ml/screenings/:screeningId/decision`.
Salary, review and interview decisions continue through the existing audited
submission moderation panel.

## Database and rollout

Run `database/postgres/migrations/011_ml_moderation.sql` manually in Supabase
after migration 010. It adds the model registry, screening audit,
professional-profile revisions, public visibility and real-training views. It
is additive and is not applied by deployment scripts. Verified salary and
rating aggregates remain final-human-only.

Roll out in three stages: shadow mode, one mature content type with explicit
auto-publish opt-in, then expansion only after overturn metrics remain
acceptable. If no service is deployed, ordinary manual moderation continues.

## Tests and limitations

```powershell
python -m unittest discover -s tests -v
```

Classical models identify patterns associated with reviewed Saple content.
They do not determine truth, fraud, intent or whether a person is trustworthy.
Human review, user reports and existing authorization rules remain decisive.
