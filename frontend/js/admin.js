import { apiRequest } from './api.js';
import { getCurrentUser, isAuthenticated } from './auth.js';

const loadingMessage = document.querySelector('#admin-loading');
const accessDenied = document.querySelector('#admin-access-denied');
const dashboard = document.querySelector('#admin-dashboard');
const adminStatus = document.querySelector('#admin-status');
const pendingCount = document.querySelector('#pending-count');
const pendingList = document.querySelector('#pending-list');
const refreshButton = document.querySelector('#refresh-queue');
const reviewPlaceholder = document.querySelector('#review-placeholder');
const reviewContent = document.querySelector('#review-content');
const reviewTitle = document.querySelector('#review-title');
const reviewStatusBadge = document.querySelector('#review-status-badge');
const submissionDetail = document.querySelector('#submission-detail');
const noteInput = document.querySelector('#moderation-note');
const noteError = document.querySelector('#moderation-note-error');
const historyContainer = document.querySelector('#moderation-history');
const decisionDialog = document.querySelector('#decision-dialog');
const decisionDialogMessage = document.querySelector('#decision-dialog-message');
const confirmDecisionButton = document.querySelector('#confirm-decision');
const decisionButtons = [...document.querySelectorAll('[data-decision]')];

let selectedSubmissionId = null;
let pendingDecision = null;

function showStatus(message, type = '') {
  adminStatus.textContent = message;
  adminStatus.className = 'state-message';
  if (type) adminStatus.classList.add(type);
  adminStatus.hidden = false;
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

function formatMoney(value, currency) {
  if (value === null || value === undefined) return 'None';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch (error) {
    return `${value} ${currency}`;
  }
}

function createDefinitionList(entries) {
  const list = document.createElement('dl');
  list.className = 'detail-grid';

  entries.forEach(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value ?? 'Not available';
    item.append(term, description);
    list.append(item);
  });

  return list;
}

function renderQueue(submissions) {
  pendingList.replaceChildren();
  pendingCount.textContent = String(submissions.length);
  pendingList.setAttribute('aria-busy', 'false');

  if (submissions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'There are no pending submissions.';
    pendingList.append(empty);
    return;
  }

  submissions.forEach((submission) => {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const meta = document.createElement('p');
    const role = document.createElement('p');
    const button = document.createElement('button');

    card.className = 'pending-card card';
    title.textContent = submission.companyName;
    meta.className = 'pending-card-meta';
    meta.textContent = `#${submission.submissionId} · ${submission.submissionType} · ${submission.verificationStatus} · ${formatDate(submission.submittedAt)}`;
    role.textContent = submission.salary?.roleName
      || submission.review?.roleName
      || submission.interview?.roleName
      || 'No job role supplied';
    button.className = 'button button-secondary button-small';
    button.type = 'button';
    button.textContent = 'Review';
    button.addEventListener('click', () => loadSubmission(submission.submissionId));
    card.append(title, meta, role, button);
    pendingList.append(card);
  });
}

async function loadQueue() {
  pendingList.setAttribute('aria-busy', 'true');
  refreshButton.disabled = true;

  try {
    const submissions = await apiRequest('/api/admin/submissions/pending', { auth: true });
    renderQueue(submissions);
  } catch (error) {
    pendingList.setAttribute('aria-busy', 'false');
    showStatus(error.message, 'error');
  } finally {
    refreshButton.disabled = false;
  }
}

function renderHistory(history) {
  historyContainer.replaceChildren();

  if (history.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No moderation decisions have been recorded.';
    historyContainer.append(empty);
    return;
  }

  const list = document.createElement('ol');
  list.className = 'history-list';
  history.forEach((action) => {
    const item = document.createElement('li');
    const transition = document.createElement('p');
    const note = document.createElement('p');
    const meta = document.createElement('p');
    item.className = 'history-item';
    transition.textContent = `${action.actionType}: ${action.previousStatus || 'None'} → ${action.newStatus}`;
    note.textContent = action.actionNote || 'No note supplied.';
    meta.className = 'history-meta';
    meta.textContent = `${action.moderatorName} · ${formatDate(action.actionAt)}`;
    item.append(transition, note, meta);
    list.append(item);
  });
  historyContainer.append(list);
}

function renderSubmission(submission, history) {
  const commonEntries = [
    ['Company', submission.companyName],
    ['Submission type', submission.submissionType],
    ['Submitted', formatDate(submission.submittedAt)],
    ['Verification', submission.verificationStatus],
    ['Anonymous publicly', submission.isAnonymous ? 'Yes' : 'No'],
    ['Internal submitter', `${submission.submitter.fullName} (${submission.submitter.email})`]
  ];

  if (submission.salary) {
    commonEntries.push(
      ['Job role', submission.salary.roleName],
      ['Base salary', formatMoney(submission.salary.baseSalary, submission.salary.currency)],
      ['Additional compensation', formatMoney(submission.salary.additionalCompensation, submission.salary.currency)],
      ['Pay period', submission.salary.payPeriod],
      ['Experience', `${submission.salary.yearsOfExperience} years`],
      ['Employment type', submission.salary.employmentType],
      ['Work mode', submission.salary.workMode],
      ['Salary year', String(submission.salary.salaryYear)]
    );
  }

  if (submission.review) {
    commonEntries.push(
      ['Job role', submission.review.roleName || 'Not supplied'],
      ['Review title', submission.review.title],
      ['Overall rating', String(submission.review.overallRating)],
      ['Work-life balance', String(submission.review.workLifeBalanceRating)],
      ['Career growth', String(submission.review.careerGrowthRating)],
      ['Management', String(submission.review.managementRating)],
      ['Culture', String(submission.review.cultureRating)],
      ['Pros', submission.review.pros],
      ['Cons', submission.review.cons],
      ['Advice to management', submission.review.adviceToManagement || 'None'],
      ['Employment status', submission.review.employmentStatus],
      ['Review date', formatDate(submission.review.reviewDate)]
    );
  }

  if (submission.interview) {
    commonEntries.push(
      ['Job role', submission.interview.roleName],
      ['Interview date', formatDate(submission.interview.interviewDate)],
      ['Difficulty', submission.interview.difficultyLevel],
      ['Rounds', String(submission.interview.roundsCount)],
      ['Interview mode', submission.interview.interviewMode],
      ['Result', submission.interview.resultStatus],
      ['Duration', `${submission.interview.durationDays} days`],
      ['Process', submission.interview.processDescription],
      ['Questions summary', submission.interview.questionsSummary || 'None']
    );
  }

  selectedSubmissionId = submission.submissionId;
  reviewPlaceholder.hidden = true;
  reviewContent.hidden = false;
  reviewTitle.textContent = `Submission #${submission.submissionId}`;
  reviewStatusBadge.textContent = submission.submissionStatus;
  submissionDetail.replaceChildren(createDefinitionList(commonEntries));
  renderHistory(history);

  const canModerate = submission.submissionStatus === 'PENDING';
  decisionButtons.forEach((button) => { button.disabled = !canModerate; });
  noteInput.disabled = !canModerate;
  if (!canModerate) noteInput.value = '';
  noteError.textContent = canModerate ? '' : 'This submission has already received a final moderation decision.';
  reviewTitle.focus();
}

async function loadSubmission(submissionId) {
  showStatus('Loading submission details…');

  try {
    const [submission, history] = await Promise.all([
      apiRequest(`/api/admin/submissions/${submissionId}`, { auth: true }),
      apiRequest(`/api/admin/submissions/${submissionId}/moderation-history`, { auth: true })
    ]);
    renderSubmission(submission, history);
    adminStatus.hidden = true;
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

function requestDecision(status) {
  const note = noteInput.value.trim();
  noteError.textContent = '';

  if ((status === 'REJECTED' || status === 'FLAGGED') && !note) {
    noteError.textContent = `A moderation note is required when marking a submission ${status}.`;
    noteInput.focus();
    return;
  }

  pendingDecision = { status, note };
  const verb = { APPROVED: 'Approve', REJECTED: 'Reject', FLAGGED: 'Flag' }[status];
  decisionDialogMessage.textContent = `${verb} submission #${selectedSubmissionId}? This decision will be written to the immutable moderation history.`;
  decisionDialog.showModal();
}

async function confirmDecision() {
  if (!pendingDecision || !selectedSubmissionId) return;
  const submissionId = selectedSubmissionId;
  const decision = pendingDecision;
  decisionDialog.close();
  decisionButtons.forEach((button) => { button.disabled = true; });
  confirmDecisionButton.disabled = true;

  try {
    await apiRequest(`/api/admin/submissions/${submissionId}/status`, {
      method: 'PATCH',
      auth: true,
      body: decision
    });
    noteInput.value = '';
    await Promise.all([loadQueue(), loadSubmission(submissionId)]);
    showStatus(`Submission #${submissionId} is now ${decision.status}.`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
    decisionButtons.forEach((button) => { button.disabled = false; });
  } finally {
    pendingDecision = null;
    confirmDecisionButton.disabled = false;
  }
}

decisionButtons.forEach((button) => {
  button.addEventListener('click', () => requestDecision(button.dataset.decision));
});
refreshButton.addEventListener('click', loadQueue);
confirmDecisionButton.addEventListener('click', confirmDecision);
decisionDialog.addEventListener('close', () => {
  if (decisionDialog.returnValue === 'cancel') pendingDecision = null;
});

async function initializeAdmin() {
  if (!isAuthenticated()) {
    window.location.replace('login.html?returnTo=admin.html');
    return;
  }

  try {
    const user = await getCurrentUser();
    if (user?.accountRole !== 'ADMIN') {
      loadingMessage.hidden = true;
      accessDenied.hidden = false;
      return;
    }

    loadingMessage.hidden = true;
    dashboard.hidden = false;
    await loadQueue();
  } catch (error) {
    if (error.status === 401) {
      window.location.replace('login.html?returnTo=admin.html');
      return;
    }
    loadingMessage.textContent = error.message;
    loadingMessage.classList.add('error');
  }
}

initializeAdmin();
