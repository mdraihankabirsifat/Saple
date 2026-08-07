import { apiRequest, fetchApi } from './api.js';
import { getToken } from './auth.js';

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
async function loadOptions() {
  try {
    const [companies, roles] = await Promise.all([fetchApi('/api/companies'), fetchApi('/api/job-roles')]);
    company.replaceChildren(new Option('Select a company', ''));
    companies.forEach((item) => company.append(new Option(item.companyName, item.companyId)));
    role.replaceChildren(new Option('No role specified', ''));
    roles.forEach((item) => role.append(new Option(item.roleName, item.roleId)));
    company.disabled = false; role.disabled = false;
  } catch (error) { show(error.message, 'error'); }
}
document.querySelector('#review-date').max = new Date().toISOString().slice(0, 10);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.hidden = true;
  if (!getToken()) return signIn();
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const body = {};
  Object.entries(ids).forEach(([key, selector]) => { body[key] = document.querySelector(selector).value; });
  ['overallRating', 'workLifeBalanceRating', 'careerGrowthRating', 'managementRating', 'cultureRating'].forEach((key) => { body[key] = Number(body[key]); });
  body.roleId = role.value ? Number(role.value) : null;
  body.isAnonymous = document.querySelector('#review-anonymous').checked;
  submit.disabled = true;
  try {
    await apiRequest(`/api/companies/${company.value}/reviews`, { method: 'POST', auth: true, body });
    show('Review submitted for moderation.', 'success');
  } catch (error) { error.status === 401 ? signIn() : show(error.message, 'error'); }
  finally { submit.disabled = false; }
});
loadOptions();
