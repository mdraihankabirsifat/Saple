import { apiRequest } from './api.js';
import { populateVerifiedScopeSelects, requireContributionAccess } from './contribution-access.js';

const form = document.querySelector('#interview-form');
const company = document.querySelector('#interview-company');
const role = document.querySelector('#interview-role');
const status = document.querySelector('#interview-status');
const submit = form.querySelector('[type="submit"]');
function show(message, type = '') {
  status.replaceChildren(document.createTextNode(message)); status.className = 'state-message form-status';
  if (type) status.classList.add(type); status.hidden = false;
}
function signIn() {
  show('Please sign in to submit an interview experience.', 'error');
  const link = document.createElement('a'); link.href = 'login.html?returnTo=interview-experience.html';
  link.className = 'state-action-link'; link.textContent = 'Sign in to continue';
  status.append(document.createElement('br'), link);
}
function loadOptions(scopes) {
  populateVerifiedScopeSelects(company, role, scopes);
}
document.querySelector('#interview-date').max = new Date().toISOString().slice(0, 10);
form.addEventListener('submit', async (event) => {
  event.preventDefault(); status.hidden = true;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const body = {
    roleId: Number(role.value), interviewDate: document.querySelector('#interview-date').value,
    difficultyLevel: document.querySelector('#interview-difficulty').value,
    roundsCount: Number(document.querySelector('#interview-rounds').value),
    interviewMode: document.querySelector('#interview-mode').value,
    resultStatus: document.querySelector('#interview-result').value,
    durationDays: Number(document.querySelector('#interview-duration').value),
    processDescription: document.querySelector('#interview-process').value,
    questionsSummary: document.querySelector('#interview-questions').value,
    isAnonymous: document.querySelector('#interview-anonymous').checked
  };
  submit.disabled = true;
  try {
    await apiRequest(`/api/companies/${company.value}/interviews`, { method: 'POST', auth: true, body });
    show('Interview experience submitted for moderation.', 'success');
  } catch (error) {
    if (error.status === 401) signIn();
    else if (error.status === 403) show('Employee verification is required for the selected company and designation.', 'error');
    else show(error.message, 'error');
  }
  finally { submit.disabled = false; }
});
(async () => {
  const access = await requireContributionAccess('interview-experience.html');
  if (access) loadOptions(access.verifiedScopes);
})();
