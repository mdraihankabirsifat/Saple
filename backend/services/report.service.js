const reportRepository = require('../repositories/report.repository');
const createHttpError = require('../utils/httpError');

function id(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw createHttpError(400, `Invalid ${label}`);
  return Number(value);
}
async function submitReport(reporterUserId, submissionIdValue, input = {}) {
  const submissionId = id(submissionIdValue, 'submission ID');
  const reasonCategory = typeof input.reasonCategory === 'string' ? input.reasonCategory.trim().toUpperCase() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!['FAKE_DATA', 'DEFAMATION', 'SPAM', 'PRIVACY', 'OTHER'].includes(reasonCategory)) throw createHttpError(400, 'Invalid report reason category');
  if (description.length > 1000) throw createHttpError(400, 'Report description must not exceed 1000 characters');
  try { return await reportRepository.createReport({ reporterUserId, submissionId, reasonCategory, description: description || null }); }
  catch (error) {
    const map = { ACCOUNT_UNAVAILABLE: 403, SUBMISSION_NOT_FOUND: 404, DUPLICATE_REPORT: 409 };
    if (map[error.sapleCode]) throw createHttpError(map[error.sapleCode], error.message);
    throw error;
  }
}
async function getReports() { return reportRepository.findReports(); }
async function getReport(value) {
  const report = await reportRepository.findReportById(id(value, 'report ID'));
  if (!report) throw createHttpError(404, 'Report not found');
  return report;
}
async function updateStatus(resolverUserId, value, input = {}) {
  const reportId = id(value, 'report ID');
  const status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
  const note = typeof input.resolutionNote === 'string' ? input.resolutionNote.trim() : '';
  const transitions = {
    REVIEWING: ['OPEN'],
    RESOLVED: ['OPEN', 'REVIEWING'],
    DISMISSED: ['OPEN', 'REVIEWING']
  };
  if (!transitions[status]) throw createHttpError(400, 'Status must be REVIEWING, RESOLVED, or DISMISSED');
  if ((status === 'RESOLVED' || status === 'DISMISSED') && !note) throw createHttpError(400, 'A resolution note is required');
  if (note.length > 1000) throw createHttpError(400, 'Resolution note must not exceed 1000 characters');
  try {
    return await reportRepository.updateReportStatus({
      reportId, resolverUserId, status, resolutionNote: note || null,
      allowedPreviousStatuses: transitions[status]
    });
  } catch (error) {
    if (error.sapleCode === 'REPORT_NOT_FOUND') throw createHttpError(404, error.message);
    if (error.sapleCode === 'INVALID_TRANSITION') throw createHttpError(409, error.message);
    throw error;
  }
}
module.exports = { submitReport, getReports, getReport, updateStatus };
