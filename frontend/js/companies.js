import { fetchApi } from './api.js';

const searchForm = document.querySelector('#company-search-form');
const searchInput = document.querySelector('#company-search');
const clearButton = document.querySelector('#clear-search');
const companyList = document.querySelector('#company-list');
const statusMessage = document.querySelector('#company-status');

function createMetaItem(label, value) {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);

  return wrapper;
}

function createCompanyCard(company) {
  const article = document.createElement('article');
  const heading = document.createElement('h2');
  const industry = document.createElement('p');
  const metadata = document.createElement('dl');
  const detailsLink = document.createElement('a');

  article.className = 'company-card';
  heading.textContent = company.companyName;
  industry.className = 'industry';
  industry.textContent = company.industry;
  metadata.className = 'company-meta';
  metadata.append(createMetaItem('Location', `${company.headquartersCity}, ${company.country}`));

  if (company.companySize) {
    metadata.append(createMetaItem('Size', company.companySize));
  }

  detailsLink.className = 'card-link';
  detailsLink.href = `company-details.html?id=${encodeURIComponent(company.companyId)}`;
  detailsLink.textContent = 'View company details →';
  detailsLink.setAttribute('aria-label', `View details for ${company.companyName}`);

  article.append(heading, industry, metadata, detailsLink);
  return article;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle('error', isError);
}

async function loadCompanies(search = '') {
  companyList.replaceChildren();
  showStatus(search ? `Searching for “${search}”…` : 'Loading companies…');

  const query = search ? `?search=${encodeURIComponent(search)}` : '';

  try {
    const companies = await fetchApi(`/api/companies${query}`);

    if (!Array.isArray(companies) || companies.length === 0) {
      showStatus(search ? 'No companies matched your search.' : 'No companies are available yet.');
      return;
    }

    statusMessage.hidden = true;
    companies.forEach((company) => companyList.append(createCompanyCard(company)));
  } catch (error) {
    showStatus(error.message, true);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const search = searchInput.value.trim();
  clearButton.hidden = search.length === 0;
  loadCompanies(search);
});

clearButton.addEventListener('click', () => {
  searchInput.value = '';
  clearButton.hidden = true;
  searchInput.focus();
  loadCompanies();
});

loadCompanies();
