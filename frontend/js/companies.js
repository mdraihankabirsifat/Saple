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
  const monogram = document.createElement('span');
  const heading = document.createElement('h3');
  const industry = document.createElement('p');
  const metadata = document.createElement('dl');
  const detailsLink = document.createElement('a');

  article.className = 'company-card';
  monogram.className = 'company-monogram';
  monogram.setAttribute('aria-hidden', 'true');
  monogram.textContent = company.companyName?.trim().charAt(0).toUpperCase() || 'S';
  heading.textContent = company.companyName || 'Unnamed company';
  metadata.className = 'company-meta';

  if (company.industry) {
    industry.className = 'industry';
    industry.textContent = company.industry;
  }

  const location = [company.headquartersCity, company.country].filter(Boolean).join(', ');

  if (location) metadata.append(createMetaItem('Location', location));
  if (company.companySize) metadata.append(createMetaItem('Size', company.companySize));

  detailsLink.className = 'card-link';
  detailsLink.href = `company-details.html?id=${encodeURIComponent(company.companyId)}`;
  detailsLink.textContent = 'View company details \u2192';
  detailsLink.setAttribute('aria-label', `View details for ${company.companyName || 'this company'}`);

  article.append(monogram, heading);
  if (company.industry) article.append(industry);
  if (metadata.childElementCount > 0) article.append(metadata);
  article.append(detailsLink);
  return article;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  statusMessage.classList.toggle('error', isError);
}

async function loadCompanies(search = '') {
  companyList.replaceChildren();
  companyList.setAttribute('aria-busy', 'true');
  showStatus(search ? `Searching for "${search}"...` : 'Loading companies...');
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
  } finally {
    companyList.setAttribute('aria-busy', 'false');
  }
}

function updateSearchUrl(search) {
  const url = new URL(window.location.href);
  search ? url.searchParams.set('search', search) : url.searchParams.delete('search');
  window.history.replaceState({}, '', url);
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const search = searchInput.value.trim();
  clearButton.hidden = search.length === 0;
  updateSearchUrl(search);
  loadCompanies(search);
});

clearButton.addEventListener('click', () => {
  searchInput.value = '';
  clearButton.hidden = true;
  searchInput.focus();
  updateSearchUrl('');
  loadCompanies();
});

const initialSearch = new URLSearchParams(window.location.search).get('search')?.trim() || '';
searchInput.value = initialSearch;
clearButton.hidden = initialSearch.length === 0;
loadCompanies(initialSearch);
