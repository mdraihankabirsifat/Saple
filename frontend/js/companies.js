import { fetchApi } from './api.js';

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
  const verified = fields.salarySource.value === 'VERIFIED';
  const count = verified ? company.verifiedSalaryCount : company.communitySalaryCount;
  const minimum = verified ? company.verifiedMinimumSalary : company.communityMinimumSalary;
  const maximum = verified ? company.verifiedMaximumSalary : company.communityMaximumSalary;
  return count ? `${Number(minimum).toLocaleString()} – ${Number(maximum).toLocaleString()} (${count})` : 'No salary data';
}

function ratingText(company) {
  const count = Number(company.reviewCount) || 0;
  if (!count) return 'No rating yet';
  return `★ ${Number(company.averageRating).toFixed(1)} (${count} ${count === 1 ? 'review' : 'reviews'})`;
}

function createCompanyCard(company) {
  const article = document.createElement('article');
  const monogram = document.createElement('span');
  const heading = document.createElement('h3');
  const headingLine = document.createElement('div');
  const rating = document.createElement('span');
  const industry = document.createElement('p');
  const metadata = document.createElement('dl');
  const detailsLink = document.createElement('a');
  article.className = 'company-card'; monogram.className = 'company-monogram';
  monogram.setAttribute('aria-hidden', 'true');
  monogram.textContent = company.companyName?.trim().charAt(0).toUpperCase() || 'S';
  heading.textContent = company.companyName || 'Unnamed company'; metadata.className = 'company-meta';
  headingLine.className = 'company-heading-line'; rating.className = 'company-rating';
  rating.textContent = ratingText(company); headingLine.append(heading, rating);
  if (company.industry) { industry.className = 'industry'; industry.textContent = company.industry; }
  const location = [company.headquartersCity, company.country].filter(Boolean).join(', ');
  if (location) metadata.append(createMetaItem('Location', location));
  if (company.companySize) metadata.append(createMetaItem('Size', company.companySize));
  metadata.append(createMetaItem(fields.salarySource.value === 'VERIFIED' ? 'Verified pay' : 'Community pay', salaryText(company)));
  metadata.append(createMetaItem('Interviews', company.interviewCount ? String(company.interviewCount) : 'None yet'));
  detailsLink.className = 'card-link'; detailsLink.href = `company-details.html?id=${encodeURIComponent(company.companyId)}`;
  detailsLink.textContent = 'View company details →';
  detailsLink.setAttribute('aria-label', `View details for ${company.companyName || 'this company'}`);
  article.append(monogram, headingLine); if (company.industry) article.append(industry);
  article.append(metadata, detailsLink); return article;
}

function queryFromForm() {
  const query = new URLSearchParams();
  Object.entries(fields).forEach(([name, input]) => {
    const value = input.type === 'checkbox' ? (input.checked ? 'true' : '') : input.value.trim();
    if (value && !(name === 'salarySource' && value === 'COMMUNITY')) query.set(name, value);
  });
  return query;
}

async function loadCompanies() {
  companyList.replaceChildren(); companyList.setAttribute('aria-busy', 'true');
  statusMessage.hidden = false; statusMessage.textContent = 'Loading companies…';
  statusMessage.classList.remove('error');
  const query = queryFromForm();
  window.history.replaceState({}, '', `${window.location.pathname}${query.size ? `?${query}` : ''}`);
  try {
    const companies = await fetchApi(`/api/companies${query.size ? `?${query}` : ''}`);
    if (!companies.length) { statusMessage.textContent = 'No companies matched these database filters.'; return; }
    statusMessage.hidden = true; companies.forEach((item) => companyList.append(createCompanyCard(item)));
  } catch (error) { statusMessage.textContent = error.message; statusMessage.classList.add('error'); }
  finally { companyList.setAttribute('aria-busy', 'false'); }
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
    const value = query.get(name);
    if (value === null) return;
    if (input.type === 'checkbox') input.checked = value === 'true';
    else input.value = value;
  });
}

form.addEventListener('submit', (event) => { event.preventDefault(); loadCompanies(); });
form.addEventListener('reset', () => setTimeout(loadCompanies));
(async () => {
  try { await loadOptions(); restoreQuery(); await loadCompanies(); }
  catch (error) { statusMessage.textContent = error.message; statusMessage.classList.add('error'); }
})();
