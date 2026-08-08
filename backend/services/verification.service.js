const verificationRepository = require('../repositories/verification.repository');
const createHttpError = require('../utils/httpError');

function positiveId(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw createHttpError(400, `Invalid ${label}`);
  }
  return Number(value);
}

async function requestVerification(userId, companyIdValue, input = {}) {
  const companyId = positiveId(companyIdValue, 'company ID');
  const roleId = positiveId(input.roleId, 'role ID');
  const employmentStatus = typeof input.employmentStatus === 'string' ? input.employmentStatus.trim().toUpperCase() : '';
  const verificationMethod = typeof input.verificationMethod === 'string' ? input.verificationMethod.trim().toUpperCase() : '';
  const companyEmail = typeof input.companyEmail === 'string' ? input.companyEmail.trim().toLowerCase() : '';
  const proofType = typeof input.proofType === 'string' ? input.proofType.trim().toUpperCase() : '';
  const proofReference = typeof input.proofReference === 'string' ? input.proofReference.trim() : '';

  if (!['CURRENT', 'FORMER'].includes(employmentStatus)) throw createHttpError(400, 'Employment status must be CURRENT or FORMER');
  if (employmentStatus === 'CURRENT' && verificationMethod !== 'COMPANY_EMAIL_OTP') {
    throw createHttpError(400, 'Current employees must use COMPANY_EMAIL_OTP');
  }
  if (employmentStatus === 'FORMER' && verificationMethod !== 'DOCUMENT') {
    throw createHttpError(400, 'Former employees must use DOCUMENT');
  }
  if (verificationMethod === 'COMPANY_EMAIL_OTP' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
    throw createHttpError(400, 'A valid company email is required');
  }
  if (verificationMethod === 'DOCUMENT' && (!proofType || proofType.length > 30 || !proofReference || proofReference.length > 255)) {
    throw createHttpError(400, 'A proof type and safe proof reference are required');
  }

  try {
    return await verificationRepository.createVerificationRequest({
      userId, companyId, roleId, employmentStatus, verificationMethod,
      companyEmail: verificationMethod === 'COMPANY_EMAIL_OTP' ? companyEmail : null,
      proofType: verificationMethod === 'DOCUMENT' ? proofType : null,
      proofReference: verificationMethod === 'DOCUMENT' ? proofReference : null
    });
  } catch (error) {
    const mappings = {
      EMPLOYEE_REQUIRED: [403, error.message],
      EMPLOYMENT_STATUS_MISMATCH: [400, error.message],
      COMPANY_NOT_FOUND: [404, error.message],
      ROLE_NOT_FOUND: [404, error.message],
      ACTIVE_VERIFICATION_EXISTS: [409, error.message]
    };
    if (mappings[error.sapleCode]) throw createHttpError(...mappings[error.sapleCode]);
    throw error;
  }
}

async function getPendingVerifications() {
  return verificationRepository.findPendingVerifications();
}

async function getVerification(value) {
  const id = positiveId(value, 'verification ID');
  const verification = await verificationRepository.findVerificationById(id);
  if (!verification) throw createHttpError(404, 'Verification request not found');
  return verification;
}

async function decideVerification(reviewerUserId, value, input = {}) {
  const verificationId = positiveId(value, 'verification ID');
  const status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
  const reason = typeof input.rejectionReason === 'string' ? input.rejectionReason.trim() : '';
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw createHttpError(400, 'Status must be VERIFIED or REJECTED');
  if (status === 'REJECTED' && !reason) throw createHttpError(400, 'A rejection reason is required');
  if (reason.length > 500) throw createHttpError(400, 'Rejection reason must not exceed 500 characters');
  try {
    return await verificationRepository.decideVerification({
      verificationId, reviewerUserId, status, rejectionReason: status === 'REJECTED' ? reason : null
    });
  } catch (error) {
    if (error.sapleCode === 'VERIFICATION_NOT_FOUND') throw createHttpError(404, error.message);
    if (error.sapleCode === 'INVALID_TRANSITION') throw createHttpError(409, error.message);
    if (error.sapleCode === 'ROLE_REQUIRED') throw createHttpError(409, error.message);
    throw error;
  }
}

module.exports = { requestVerification, getPendingVerifications, getVerification, decideVerification };
