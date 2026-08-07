const adminRepository = require('../repositories/admin.repository');
const createHttpError = require('../utils/httpError');

const DECISIONS = {
  APPROVED: { actionType: 'APPROVE', noteRequired: false, allowedPreviousStatuses: ['PENDING'] },
  REJECTED: { actionType: 'REJECT', noteRequired: true, allowedPreviousStatuses: ['PENDING'] },
  FLAGGED: { actionType: 'FLAG', noteRequired: true, allowedPreviousStatuses: ['PENDING'] }
};

function validateSubmissionId(value) {
  if (!/^\d+$/.test(String(value))) {
    throw createHttpError(400, 'Invalid submission ID');
  }

  const submissionId = Number(value);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    throw createHttpError(400, 'Invalid submission ID');
  }

  return submissionId;
}

function toSubmission(row, { includeSubmitter = true } = {}) {
  const submission = {
    submissionId: row.submissionId,
    submissionType: row.submissionType,
    companyId: row.companyId,
    companyName: row.companyName,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    updatedAt: row.updatedAt,
    submissionStatus: row.submissionStatus,
    verificationStatus: row.verificationStatus,
    isAnonymous: row.isAnonymous === 1,
    ...(row.submissionType === 'SALARY' ? {
      salary: {
        roleId: row.roleId,
        roleName: row.roleName,
        baseSalary: row.baseSalary,
        additionalCompensation: row.additionalCompensation,
        currency: row.currency,
        payPeriod: row.payPeriod,
        yearsOfExperience: row.yearsOfExperience,
        employmentType: row.employmentType,
        workMode: row.workMode,
        salaryYear: row.salaryYear
      }
    } : {}),
    ...(row.submissionType === 'REVIEW' ? {
      review: {
        roleId: row.roleId,
        roleName: row.roleName,
        title: row.reviewTitle,
        overallRating: row.overallRating,
        workLifeBalanceRating: row.workLifeBalanceRating,
        careerGrowthRating: row.careerGrowthRating,
        managementRating: row.managementRating,
        cultureRating: row.cultureRating,
        pros: row.pros,
        cons: row.cons,
        adviceToManagement: row.adviceToManagement,
        employmentStatus: row.reviewEmploymentStatus,
        reviewDate: row.reviewDate
      }
    } : {}),
    ...(row.submissionType === 'INTERVIEW' ? {
      interview: {
        roleId: row.roleId,
        roleName: row.roleName,
        interviewDate: row.interviewDate,
        difficultyLevel: row.difficultyLevel,
        roundsCount: row.roundsCount,
        interviewMode: row.interviewMode,
        resultStatus: row.resultStatus,
        durationDays: row.durationDays,
        processDescription: row.processDescription,
        questionsSummary: row.questionsSummary
      }
    } : {})
  };

  if (includeSubmitter) {
    submission.submitter = {
      userId: row.submitterUserId,
      fullName: row.submitterName,
      email: row.submitterEmail,
      userType: row.submitterType
    };
  }

  return submission;
}

async function getPendingSubmissions() {
  const rows = await adminRepository.findPendingSubmissions();
  return rows.map((row) => toSubmission(row, { includeSubmitter: false }));
}

async function getSubmission(submissionIdValue) {
  const submissionId = validateSubmissionId(submissionIdValue);
  const row = await adminRepository.findSubmissionById(submissionId);

  if (!row) throw createHttpError(404, 'Submission not found');
  return toSubmission(row);
}

async function getModerationHistory(submissionIdValue) {
  const submissionId = validateSubmissionId(submissionIdValue);
  const history = await adminRepository.findModerationHistory(submissionId);

  if (history === null) throw createHttpError(404, 'Submission not found');
  return history;
}

async function moderateSubmission(moderatorUserId, submissionIdValue, input = {}) {
  const submissionId = validateSubmissionId(submissionIdValue);
  const status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
  const decision = DECISIONS[status];

  if (!decision) {
    throw createHttpError(400, 'Status must be APPROVED, REJECTED, or FLAGGED');
  }

  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') {
    throw createHttpError(400, 'Moderation note must be text');
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';

  if (decision.noteRequired && !note) {
    throw createHttpError(400, `A moderation note is required when marking a submission ${status}`);
  }

  if (note.length > 1000) {
    throw createHttpError(400, 'Moderation note must not exceed 1000 characters');
  }

  try {
    return await adminRepository.updateSubmissionStatusWithAudit({
      submissionId,
      moderatorUserId,
      newStatus: status,
      actionType: decision.actionType,
      actionNote: note || null,
      allowedPreviousStatuses: decision.allowedPreviousStatuses
    });
  } catch (error) {
    if (error.sapleCode === 'SUBMISSION_NOT_FOUND') {
      throw createHttpError(404, 'Submission not found');
    }
    if (error.sapleCode === 'INVALID_TRANSITION') {
      throw createHttpError(409, error.message);
    }
    throw error;
  }
}

module.exports = {
  getPendingSubmissions,
  getSubmission,
  getModerationHistory,
  moderateSubmission,
  validateSubmissionId
};
