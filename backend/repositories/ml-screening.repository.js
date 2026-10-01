const database = require('../config/database');
const { insertNotification } = require('./notification.repository');

// Called inside the domain write transaction. No raw contribution text is
// retained in the audit row; public fields are held in their domain table.
async function recordSubmission(client, { type, submissionId, userId, screening }) {
  if (!screening) return;
  let publicationState = screening.publicationState;
  const reasons = [...screening.reasonCodes];
  if (publicationState === 'PROVISIONAL') {
    const cap = Math.max(1, Math.min(20, Number(process.env.ML_AUTO_PUBLISH_DAILY_CAP) || 3));
    const usage = await client.query(`
      SELECT COUNT(*)::int AS used FROM content_screenings
      WHERE submitted_by_user_id = $1 AND entity_type = $2
        AND publication_state = 'PROVISIONAL' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
    `, [userId, type]);
    if (Number(usage.rows[0]?.used || 0) >= cap) {
      publicationState = 'HELD';
      reasons.push('DAILY_PROVISIONAL_CAP');
    }
    const overturn = await client.query(`
      SELECT COUNT(*)::int AS reviewed,
        COUNT(*) FILTER (WHERE manual_review_status = 'REJECTED')::int AS rejected
      FROM content_screenings
      WHERE model_key = $1 AND model_version = $2
        AND model_metadata->>'initialPublicationState' = 'PROVISIONAL'
        AND manual_review_status IN ('APPROVED','REJECTED')
    `, [screening.modelKey, screening.modelVersion]);
    const sample = overturn.rows[0];
    if (Number(sample?.reviewed || 0) >= 20 && Number(sample.rejected) / Number(sample.reviewed) > 0.02) {
      publicationState = 'HELD';
      reasons.push('MODEL_OVERTURN_RATE');
    }
  }
  const provisional = publicationState === 'PROVISIONAL';
  await client.query(`
    INSERT INTO content_screenings (
      entity_type, entity_id, revision_no, submitted_by_user_id,
      model_key, model_version, feature_schema_version, screening_status,
      risk_probability, safe_probability, confidence, reason_codes, model_metadata,
      publication_state, manual_review_status, screened_at, provisional_published_at
    ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
      $13, 'PENDING', CURRENT_TIMESTAMP, CASE WHEN $13 = 'PROVISIONAL' THEN CURRENT_TIMESTAMP ELSE NULL END)
  `, [type, submissionId, userId, screening.modelKey, screening.modelVersion,
    screening.featureSchemaVersion, screening.screeningStatus, screening.riskProbability,
    screening.riskProbability === null ? null : 1 - screening.riskProbability,
    screening.confidence, JSON.stringify(reasons),
    JSON.stringify({ ...screening.modelMetadata, initialPublicationState: publicationState }),
    publicationState]);
  await insertNotification(client, {
    userId, notificationType: 'SUBMISSION_DECISION',
    title: 'Contribution received',
    message: provisional
      ? 'Initial screening complete. Your contribution is now visible while it awaits final manual review.'
      : 'Your contribution was received and is waiting for manual review.',
    relatedEntityType: 'SUBMISSION', relatedEntityId: submissionId
  });
  return publicationState;
}

module.exports = { recordSubmission };

async function applyProfileSnapshot(client, userId, snapshot) {
  await client.query(`UPDATE users SET full_name = $2, headline = $3, bio = $4,
    updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND account_status = 'ACTIVE'`,
  [userId, snapshot.fullName, snapshot.headline, snapshot.bio]);
  const educationIds = (snapshot.education || []).map((item) => Number(item.educationId)).filter(Number.isSafeInteger);
  const experienceIds = (snapshot.experience || []).map((item) => Number(item.experienceId)).filter(Number.isSafeInteger);
  await client.query(`DELETE FROM user_education WHERE user_id = $1 AND NOT (education_id = ANY($2::bigint[]))`, [userId, educationIds]);
  await client.query(`DELETE FROM user_experience WHERE user_id = $1 AND NOT (experience_id = ANY($2::bigint[]))`, [userId, experienceIds]);
  for (const item of snapshot.education || []) {
    if (item.educationId) {
      await client.query(`UPDATE user_education SET institution = $3, degree = $4, field_of_study = $5,
        start_date = $6, end_date = $7, currently_studying = $8, description = $9
        WHERE user_id = $1 AND education_id = $2`,
      [userId, item.educationId, item.institution, item.degree, item.fieldOfStudy, item.startDate,
        item.endDate, item.currentlyStudying, item.description]);
    } else await client.query(`INSERT INTO user_education
      (user_id, institution, degree, field_of_study, start_date, end_date, currently_studying, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, item.institution, item.degree, item.fieldOfStudy, item.startDate, item.endDate,
      item.currentlyStudying, item.description]);
  }
  for (const item of snapshot.experience || []) {
    if (item.experienceId) {
      await client.query(`UPDATE user_experience SET organization = $3, job_title = $4,
        employment_type = $5, location = $6, start_date = $7, end_date = $8,
        currently_working = $9, description = $10 WHERE user_id = $1 AND experience_id = $2`,
      [userId, item.experienceId, item.organization, item.jobTitle, item.employmentType, item.location,
        item.startDate, item.endDate, item.currentlyWorking, item.description]);
    } else await client.query(`INSERT INTO user_experience
      (user_id, organization, job_title, employment_type, location, start_date, end_date,
       currently_working, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [userId, item.organization, item.jobTitle, item.employmentType, item.location, item.startDate,
      item.endDate, item.currentlyWorking, item.description]);
  }
  await client.query('DELETE FROM user_skills WHERE user_id = $1', [userId]);
  for (const item of snapshot.skills || []) {
    const skill = await client.query(`INSERT INTO skills (skill_name) VALUES ($1)
      ON CONFLICT DO NOTHING RETURNING skill_id`, [item.name]);
    const skillId = skill.rows[0]?.skill_id || (await client.query(
      'SELECT skill_id FROM skills WHERE LOWER(skill_name) = LOWER($1)', [item.name])).rows[0]?.skill_id;
    if (skillId) await client.query(`INSERT INTO user_skills (user_id, skill_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, skillId]);
  }
}

async function recordProfileRevision({ userId, previousSnapshot, proposedSnapshot, screening }) {
  if (!screening) return null;
  return database.withTransaction(async (client) => {
    await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    const latest = await client.query(`SELECT revision_no AS revision
      FROM professional_profile_revisions WHERE user_id = $1 ORDER BY revision_no DESC LIMIT 1 FOR UPDATE`, [userId]);
    const revisionNo = Number(latest.rows[0]?.revision || 0) + 1;
    const provisional = screening.publicationState === 'PROVISIONAL';
    const screeningRow = await client.query(`
      INSERT INTO content_screenings (
        entity_type, entity_id, revision_no, submitted_by_user_id, model_key, model_version,
        feature_schema_version, screening_status, risk_probability, safe_probability,
        confidence, reason_codes, model_metadata, publication_state, manual_review_status,
        screened_at, provisional_published_at
      ) VALUES ('PROFILE', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
        $13, 'PENDING', CURRENT_TIMESTAMP,
        CASE WHEN $13 = 'PROVISIONAL' THEN CURRENT_TIMESTAMP ELSE NULL END)
      RETURNING screening_id AS "screeningId"
    `, [userId, revisionNo, userId, screening.modelKey, screening.modelVersion,
      screening.featureSchemaVersion, screening.screeningStatus, screening.riskProbability,
      screening.riskProbability === null ? null : 1 - screening.riskProbability,
      screening.confidence, JSON.stringify(screening.reasonCodes), JSON.stringify({ ...screening.modelMetadata }),
      provisional ? 'PROVISIONAL' : 'HELD']);
    await client.query(`INSERT INTO professional_profile_revisions
      (user_id, revision_no, previous_public_snapshot, proposed_public_snapshot, applied_at, screening_id)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END, $5)`,
    [userId, revisionNo, JSON.stringify(previousSnapshot || {}), JSON.stringify(proposedSnapshot || {}),
      screeningRow.rows[0].screeningId, provisional]);
    if (provisional) await applyProfileSnapshot(client, userId, proposedSnapshot);
    await insertNotification(client, {
      userId, notificationType: 'SUBMISSION_DECISION', title: 'Profile review started',
      message: provisional
        ? 'Initial screening complete. Your profile update is live while it awaits final manual review.'
        : 'Your profile update is waiting for manual review.',
    relatedEntityType: 'ACCOUNT', relatedEntityId: userId
    });
    return { revisionNo, screeningId: screeningRow.rows[0].screeningId,
      publicationState: provisional ? 'PROVISIONAL' : 'HELD', applied: provisional };
  });
}

module.exports.recordProfileRevision = recordProfileRevision;
module.exports.applyProfileSnapshot = applyProfileSnapshot;

async function recordJobScreening(client, { jobId, userId, screening }) {
  if (!screening) return;
  const latest = await client.query(`SELECT COALESCE(MAX(revision_no), 0)::int AS revision
    FROM content_screenings WHERE entity_type = 'JOB' AND entity_id = $1`, [jobId]);
  const revisionNo = Number(latest.rows[0]?.revision || 0) + 1;
  const publicationState = screening.publicationState === 'PROVISIONAL' ? 'PROVISIONAL' : 'HELD';
  await client.query(`INSERT INTO content_screenings (
    entity_type, entity_id, revision_no, submitted_by_user_id, model_key, model_version,
    feature_schema_version, screening_status, risk_probability, safe_probability, confidence,
    reason_codes, model_metadata, publication_state, manual_review_status,
    screened_at, provisional_published_at
  ) VALUES ('JOB', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
    $13, 'PENDING', CURRENT_TIMESTAMP,
    CASE WHEN $13 = 'PROVISIONAL' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
  [jobId, revisionNo, userId, screening.modelKey, screening.modelVersion, screening.featureSchemaVersion,
    screening.screeningStatus, screening.riskProbability, screening.riskProbability === null ? null : 1 - screening.riskProbability,
    screening.confidence, JSON.stringify(screening.reasonCodes), JSON.stringify({ ...screening.modelMetadata }), publicationState]);
  await insertNotification(client, {
    userId, notificationType: 'SUBMISSION_DECISION', title: 'Job review started',
    message: publicationState === 'PROVISIONAL'
      ? 'Initial screening complete. Your job is live while it awaits final manual review.'
      : 'Your job posting is saved as a draft while it waits for manual review.',
    relatedEntityType: 'JOB', relatedEntityId: jobId
  });
}

module.exports.recordJobScreening = recordJobScreening;

async function findPendingScreenings() {
  const result = await database.query(`
    SELECT cs.screening_id AS "screeningId", cs.entity_type AS "entityType", cs.entity_id AS "entityId",
      cs.revision_no AS "revisionNo", cs.submitted_by_user_id AS "submittedByUserId",
      cs.model_key AS "modelKey", cs.model_version AS "modelVersion",
      cs.screening_status AS "screeningStatus", cs.risk_probability AS "riskProbability",
      cs.safe_probability AS "safeProbability", cs.confidence,
      cs.reason_codes AS "reasonCodes", cs.model_metadata AS "modelMetadata",
      cs.publication_state AS "publicationState", cs.manual_review_status AS "manualReviewStatus",
      cs.created_at AS "createdAt", u.full_name AS "submitterName"
    FROM content_screenings cs
    LEFT JOIN users u ON u.user_id = cs.submitted_by_user_id
    WHERE cs.manual_review_status = 'PENDING'
    ORDER BY cs.created_at ASC, cs.screening_id ASC
    LIMIT 200`);
  return result.rows;
}

async function findScreening(screeningId) {
  const result = await database.query(`SELECT * FROM content_screenings
    WHERE screening_id = $1`, [screeningId]);
  return result.rows[0] || null;
}

async function decideProfileScreening({ screeningId, moderatorUserId, status, note }) {
  return database.withTransaction(async (client) => {
    const owner = await client.query(`SELECT user_id FROM users WHERE user_id = (
      SELECT entity_id FROM content_screenings WHERE screening_id = $1 AND entity_type = 'PROFILE'
    ) FOR UPDATE`, [screeningId]);
    if (!owner.rows[0]) return null;
    const result = await client.query(`SELECT cs.*, p.proposed_public_snapshot, p.revision_id
      , p.previous_public_snapshot, p.applied_at
      FROM content_screenings cs
      JOIN professional_profile_revisions p ON p.screening_id = cs.screening_id
      WHERE cs.screening_id = $1 AND cs.entity_type = 'PROFILE' FOR UPDATE`, [screeningId]);
    const row = result.rows[0];
    if (!row || row.manual_review_status !== 'PENDING') return null;
    const latest = await client.query(`SELECT MAX(revision_no)::int AS latest
      FROM professional_profile_revisions WHERE user_id = $1`, [row.entity_id]);
    const current = Number(latest.rows[0]?.latest) === Number(row.revision_no);
    const approved = status === 'APPROVED';
    if (current && approved && !row.applied_at) {
      await applyProfileSnapshot(client, row.entity_id, row.proposed_public_snapshot);
    }
    if (current && !approved && row.applied_at) {
      await applyProfileSnapshot(client, row.entity_id, row.previous_public_snapshot);
    }
    await client.query(`UPDATE professional_profile_revisions SET review_status = $2,
      applied_at = CASE WHEN $2 = 'APPROVED' THEN COALESCE(applied_at, CURRENT_TIMESTAMP) ELSE applied_at END,
      reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $3 WHERE revision_id = $1`,
    [row.revision_id, status, moderatorUserId]);
    await client.query(`UPDATE content_screenings SET publication_state = $2,
      manual_review_status = $3, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $4,
      human_decision_note = $5, updated_at = CURRENT_TIMESTAMP WHERE screening_id = $1`,
    [screeningId, approved ? 'CONFIRMED' : 'REMOVED', status, moderatorUserId, note || null]);
    await insertNotification(client, {
      userId: row.submitted_by_user_id, notificationType: 'SUBMISSION_DECISION',
      title: 'Profile review completed',
      message: approved ? 'Your profile update was confirmed by a moderator.' : 'Your profile update was declined by a moderator.',
      relatedEntityType: 'ACCOUNT', relatedEntityId: row.entity_id
    });
    return { screeningId: Number(screeningId), status, publicationState: approved ? 'CONFIRMED' : 'REMOVED',
      appliedToCurrentProfile: current };
  });
}

async function decideJobScreening({ screeningId, moderatorUserId, status, note }) {
  return database.withTransaction(async (client) => {
    const result = await client.query(`SELECT * FROM content_screenings
      WHERE screening_id = $1 AND entity_type = 'JOB' FOR UPDATE`, [screeningId]);
    const row = result.rows[0];
    if (!row || row.manual_review_status !== 'PENDING') return null;
    const approved = status === 'APPROVED';
    if (approved) {
      await client.query(`UPDATE job_postings SET job_status = 'PUBLISHED',
        published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE job_id = $1 AND job_status = 'DRAFT'`, [row.entity_id]);
    } else {
      await client.query(`UPDATE job_postings SET job_status = 'DRAFT', published_at = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE job_id = $1 AND job_status = 'PUBLISHED'`, [row.entity_id]);
    }
    await client.query(`UPDATE content_screenings SET publication_state = $2,
      manual_review_status = $3, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = $4,
      human_decision_note = $5, updated_at = CURRENT_TIMESTAMP WHERE screening_id = $1`,
    [screeningId, approved ? 'CONFIRMED' : 'REMOVED', status, moderatorUserId, note || null]);
    await insertNotification(client, {
      userId: row.submitted_by_user_id, notificationType: 'SUBMISSION_DECISION',
      title: 'Job review completed',
      message: approved ? 'Your job posting was confirmed and published.' : 'Your job posting was declined and remains unpublished.',
      relatedEntityType: 'JOB', relatedEntityId: row.entity_id
    });
    return { screeningId: Number(screeningId), status, publicationState: approved ? 'CONFIRMED' : 'REMOVED' };
  });
}

module.exports.findPendingScreenings = findPendingScreenings;
module.exports.findScreening = findScreening;
module.exports.decideProfileScreening = decideProfileScreening;
module.exports.decideJobScreening = decideJobScreening;
