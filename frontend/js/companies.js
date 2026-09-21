import { fetchApi } from './api.js';
import { createCompanyLogo } from './company-logo.js';
import { paginate, pageNumbers, sortCompanies, SORT_OPTIONS } from './company-directory.js';
import { createSalaryRange } from './salary-range.js';
import { mountFilterDrawer } from './browse-controls.js';

const form = document.querySelector('#company-search-form');
const fields = {
  search: document.querySelector('#company-search'),
  industry: document.querySelector('#company-industry'),
  roleId: document.querySelector('#company-role'),
  location: document.querySelector('#company-location'),
  minSalary: document.querySelector('#company-min-salary'),
  maxSalary: document.querySelector('#company-max-salary'),
  salarySource: document.querySelector('#company-salary-source'),
  companySize: document.querySelector('#company-size'),
  minRating: document.querySelector('#company-rating'),
  hasSalaryData: document.querySelector('#company-has-salary'),
  hasReviews: document.querySelector('#company-has-reviews'),
  hasInterviews: document.querySelector('#company-has-interviews')
};
const companyList = document.querySelector('#company-list');
const statusMessage = document.querySelector('#company-status');

function createMetaItem(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label; description.textContent = value; wrapper.append(term, description);
  return wrapper;
}

function salaryText(company) {
  const verified = appliedQuery.get('salarySource') === 'VERIFIED';
  const count = verified ? company.verifiedSalaryCount : company.communitySalaryCount;
  const minimum = verified ? company.verifiedMinimumSalary : company.communityMinimumSalary;
  const maximum = verified ? company.verifiedMaximumSalary : company.communityMaximumSalary;
  return Number(count) > 0 ? `${Number(minimum).toLocaleString()} – ${Number(maximum).toLocaleString()} (${count})` : 'No salary data';
}

function ratingText(company) {
  const count = Number(company.reviewCount) || 0;
  if (!count) return 'No rating yet';
  return `★ ${Number(company.averageRating).toFixed(1)} (${count} ${count === 1 ? 'review' : 'reviews'})`;
}

function createCompanyCard(company) {
  const article = document.createElement('article');
  const logo = createCompanyLogo(company.companyName, company.website);
  const heading = document.createElement('h3');
  const headingLine = document.createElement('div');
  const rating = document.createElement('span');
  const industry = document.createElement('p');
  const metadata = document.createElement('dl');
  const detailsLink = document.createElement('a');
  article.className = 'company-card';
  heading.textContent = company.companyName || 'Unnamed company'; metadata.className = 'company-meta';
  headingLine.className = 'company-heading-line'; rating.className = 'company-rating';
  rating.textContent = ratingText(company); headingLine.append(heading, rating);
  if (company.industry) { industry.className = 'industry'; industry.textContent = company.industry; }
  const location = [company.headquartersCity, company.country].filter(Boolean).join(', ');
  if (location) metadata.append(createMetaItem('Location', location));
  if (company.companySize) metadata.append(createMetaItem('Size', company.companySize));
  metadata.append(createMetaItem(appliedQuery.get('salarySource') === 'VERIFIED' ? 'Verified pay' : 'Community pay', salaryText(company)));
  metadata.append(createMetaItem('Interviews', company.interviewCount ? String(company.interviewCount) : 'None yet'));
  detailsLink.className = 'card-link'; detailsLink.href = `company-details.html?id=${encodeURIComponent(company.companyId)}`;
  detailsLink.textContent = 'View company details →';
  detailsLink.setAttribute('aria-label', `View details for ${company.companyName || 'this company'}`);
  article.append(logo, headingLine); if (company.industry) article.append(industry);
  article.append(metadata, detailsLink); return article;
}

const sortInput = document.querySelector('#company-sort');
const heading = document.querySelector('#company-results-heading');
const summary = document.querySelector('#company-result-summary');
const pagination = document.querySelector('#company-pagination');
const range = createSalaryRange(document.querySelector('#salary-range-control'), fields.minSalary, fields.maxSalary);
let appliedQuery = new URLSearchParams();
let companies = [];
let page = 1;
let requestId = 0;
let loadedKey = null;

function queryFromForm() {
  const query = new URLSearchParams();
  Object.entries(fields).forEach(([name, input]) => {
    const value = input.type === 'checkbox' ? (input.checked ? 'true' : '')
      : name === 'minSalary' ? range.values.min : name === 'maxSalary' ? range.values.max : input.value.trim();
    if (value !== null && value !== '' && !(name === 'salarySource' && value === 'COMMUNITY')) query.set(name, value);
  });
  if (sortInput.value !== 'name-asc') query.set('sort', sortInput.value);
  return query;
}
function writeUrl(push = false) {
  const query = new URLSearchParams(appliedQuery);
  if (page > 1) query.set('page', page);
  const url = `${window.location.pathname}${query.size ? `?${query}` : ''}${window.location.hash}`;
  if (push && url !== `${location.pathname}${location.search}${location.hash}`) history.pushState({}, '', url);
  else history.replaceState({}, '', url);
}
function focusResults() {
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function renderResults(focus = false) {
  const result = paginate(sortCompanies(companies, appliedQuery.get('sort') || 'name-asc', appliedQuery.get('salarySource')), page);
  page = result.page;
  companyList.replaceChildren(...result.items.map(createCompanyCard));
  summary.textContent = `Showing ${result.start}–${result.end} of ${result.total} companies.`;
  statusMessage.hidden = result.total > 0;
  statusMessage.textContent = result.total ? '' : 'No companies match these filters. Try clearing a filter.';
  pagination.replaceChildren();
  function button(label, destination, current = false, disabled = false) {
    const control = document.createElement('button');
    control.type = 'button'; control.className = 'button button-secondary'; control.textContent = label;
    control.disabled = disabled;
    control.setAttribute('aria-label', /^\d+$/.test(label) ? `Page ${label}` : `${label} page`);
    if (current) control.setAttribute('aria-current', 'page');
    control.addEventListener('click', () => { page = destination; writeUrl(true); renderResults(true); });
    pagination.append(control);
  }
  if (result.pages > 1) {
    button('Previous', page - 1, false, page === 1);
    pageNumbers(page, result.pages).forEach((number) => {
      if (typeof number === 'number') button(String(number), number, page === number);
      else { const gap = document.createElement('span'); gap.textContent = number; gap.setAttribute('aria-hidden', 'true'); pagination.append(gap); }
    });
    button('Next', page + 1, false, page === result.pages);
  }
  writeUrl();
  if (focus) focusResults();
}
async function loadCompanies(focus = false) {
  const id = ++requestId;
  const query = new URLSearchParams(appliedQuery); query.delete('sort');
  drawer.setCount([...query.keys()].length);
  if (loadedKey === query.toString()) {
    companyList.setAttribute('aria-busy', 'false'); statusMessage.classList.remove('error');
    renderResults(focus); return;
  }
  companyList.replaceChildren(); pagination.replaceChildren(); summary.textContent = '';
  companyList.setAttribute('aria-busy', 'true');
  statusMessage.hidden = false; statusMessage.textContent = 'Loading companies...'; statusMessage.classList.remove('error');
  try {
    const response = await fetchApi(`/api/companies${query.size ? `?${query}` : ''}`);
    if (id !== requestId) return;
    companies = response; loadedKey = query.toString(); renderResults(focus);
  } catch (error) {
    if (id !== requestId) return;
    statusMessage.textContent = error.message; statusMessage.classList.add('error');
  } finally { if (id === requestId) companyList.setAttribute('aria-busy', 'false'); }
}

async function loadOptions() {
  const [options, roles] = await Promise.all([
    fetchApi('/api/companies/filter-options'), fetchApi('/api/job-roles')
  ]);
  options.industries.forEach((value) => fields.industry.append(new Option(value, value)));
  options.locations.forEach((value) => fields.location.append(new Option(value, value)));
  options.companySizes.forEach((value) => fields.companySize.append(new Option(value, value)));
  roles.forEach((role) => fields.roleId.append(new Option(role.roleName, role.roleId)));
}

function restoreQuery() {
  const query = new URLSearchParams(window.location.search);
  Object.entries(fields).forEach(([name, input]) => {
    const saved = query.get(name);
    if (saved && input.tagName === 'SELECT' && ![...input.options].some((option) => option.value === saved)
      && !['salarySource', 'minRating'].includes(name)) input.append(new Option(saved, saved));
    if (input.type === 'checkbox') input.checked = query.get(name) === 'true';
    else input.value = query.get(name) ?? (name === 'salarySource' ? 'COMMUNITY' : '');
    input.setCustomValidity('');
  });
  sortInput.value = SORT_OPTIONS.includes(query.get('sort')) ? query.get('sort') : 'name-asc';
  range.sync(); appliedQuery = queryFromForm(); page = Number(query.get('page')) || 1;
}
// The shared drawer moves this sidebar into a modal dialog below 1050px.
const drawer = mountFilterDrawer({
  panel: document.querySelector('#directory-filters'),
  toggle: document.querySelector('#directory-filter-toggle')
});
function closeFilters() { drawer.close(); }
function applyFilters() {
  range.sync(); appliedQuery = queryFromForm(); page = 1; writeUrl(true); closeFilters(); loadCompanies(true);
}
form.addEventListener('submit', (event) => { event.preventDefault(); applyFilters(); });
form.addEventListener('reset', () => setTimeout(() => {
  Object.values(fields).forEach((input) => input.setCustomValidity(''));
  applyFilters();
}));
sortInput.addEventListener('change', () => { if (!drawer.isDrawer() && form.checkValidity()) applyFilters(); });
window.addEventListener('popstate', () => { closeFilters(); restoreQuery(); loadCompanies(true); });
(async () => {
  try { await loadOptions(); }
  catch { /* The directory remains usable if optional filter lookups fail. */ }
  restoreQuery(); await loadCompanies();
})();
