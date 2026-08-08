import { apiRequest } from './api.js';
import { populateVerifiedScopeSelects, requireContributionAccess } from './contribution-access.js';

const form = document.querySelector('#review-form');
const company = document.querySelector('#review-company');
const role = document.querySelector('#review-role');
const status = document.querySelector('#review-status');
const submit = form.querySelector('[type="submit"]');
const ids = {
  employmentStatus: '#review-employment-status', reviewDate: '#review-date',
  reviewTitle: '#review-title', overallRating: '#overall-rating',
  workLifeBalanceRating: '#work-life-rating', careerGrowthRating: '#growth-rating',
  managementRating: '#management-rating', cultureRating: '#culture-rating',
  pros: '#review-pros', cons: '#review-cons', adviceToManagement: '#review-advice'
};

function show(message, type = '') {
  status.replaceChildren(document.createTextNode(message));
  status.className = 'state-message form-status';
  if (type) status.classList.add(type);
  status.hidden = false;
}
function signIn() {
  show('Please sign in with an employee account to submit a review.', 'error');
  const link = document.createElement('a');
  link.href = 'login.html?returnTo=submit-review.html';
  link.className = 'state-action-link';
  link.textContent = 'Sign in to continue';
  status.append(document.createElement('br'), link);
}
function loadOptions(scopes) {
  populateVerifiedScopeSelects(company, role, scopes);
}
document.querySelector('#review-date').max = new Date().toISOString().slice(0, 10);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.hidden = true;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const body = {};
  Object.entries(ids).forEach(([key, selector]) => { body[key] = document.querySelector(selector).value; });
  ['overallRating', 'workLifeBalanceRating', 'careerGrowthRating', 'managementRating', 'cultureRating'].forEach((key) => { body[key] = Number(body[key]); });
  body.roleId = Number(role.value);
  body.isAnonymous = document.querySelector('#review-anonymous').checked;
  submit.disabled = true;
  try {
    await apiRequest(`/api/companies/${company.value}/reviews`, { method: 'POST', auth: true, body });
    show('Review submitted for moderation.', 'success');
  } catch (error) {
    if (error.status === 401) signIn();
    else if (error.status === 403) show('Employee verification is required for the selected company and designation.', 'error');
    else show(error.message, 'error');
  }
  finally { submit.disabled = false; }
});
(async () => {
  const access = await requireContributionAccess('submit-review.html');
  if (access) {
    const employmentStatus = document.querySelector('#review-employment-status');
    employmentStatus.value = access.user.employmentStatus || '';
    employmentStatus.disabled = true;
    loadOptions(access.verifiedScopes);
  }
})();
