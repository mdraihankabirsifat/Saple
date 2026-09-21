import { fetchApi } from './api.js';
import {
  el, clear, renderSkeletons, renderEmptyState, renderErrorState,
  renderPagination, formatDate, formatSalaryRange, humanizeEnum
} from './ui.js';
import { createCompanyLogo } from './company-logo.js';

const results = document.querySelector('#job-results');
const statusMessage = document.querySelector('#job-status');
const paginationHost = document.querySelector('#job-pagination');
const filterForm = document.querySelector('#job-filters');
const countLabel = document.querySelector('#job-count');

const FILTER_FIELDS = ['search', 'companyId', 'roleId', 'location', 'workMode', 'employmentType'];
let currentPage = 1;

function readFilters() {
  const data = new FormData(filterForm);
  const filters = {};
  for (const field of FILTER_FIELDS) {
    const value = String(data.get(field) || '').trim();
    if (value) filters[field] = value;
  }
  return filters;
}

// The address bar mirrors the current view, so a filtered job search can be
// shared or reloaded. Only known filter names are ever written or read.
function syncAddressBar(filters, page) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) params.set(name, value);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function applyAddressBarToForm() {
  const params = new URLSearchParams(window.location.search);
  for (const field of FILTER_FIELDS) {
    const value = params.get(field);
    const control = filterForm?.elements.namedItem(field);
    if (value && control) control.value = value;
  }
  const page = Number(params.get('page'));
  currentPage = Number.isInteger(page) && page > 0 ? page : 1;
}

function jobCard(job) {
  const deadline = el('span', {
    className: 'job-deadline',
    text: `Apply by ${formatDate(job.applicationDeadline)}`
  });

  const tags = el('ul', { className: 'job-tags', attrs: { 'aria-label': 'Job attributes' } }, [
    el('li', { className: 'job-tag', text: humanizeEnum(job.employmentType) }),
    el('li', { className: 'job-tag', text: humanizeEnum(job.workMode) }),
    job.roleName ? el('li', { className: 'job-tag', text: job.roleName }) : null
  ]);

  return el('article', { className: 'job-card card', dataset: { jobId: job.jobId } }, [
    el('div', { className: 'job-card-head' }, [
      createCompanyLogo(job.companyName, null),
      el('div', { className: 'job-card-identity' }, [
        el('h2', { className: 'job-card-title' }, [
          el('a', { className: 'job-card-link', text: job.title, attrs: { href: `job-details.html?id=${encodeURIComponent(job.jobId)}` } })
        ]),
        el('p', { className: 'job-card-company', text: job.companyName }),
        el('p', { className: 'job-card-location', text: job.location })
      ])
    ]),
    el('p', { className: 'job-card-salary', text: formatSalaryRange(job) }),
    tags,
    el('div', { className: 'job-card-foot' }, [
      deadline,
      el('a', {
        className: 'button button-secondary button-small',
        text: 'View details',
        attrs: { href: `job-details.html?id=${encodeURIComponent(job.jobId)}` }
      })
    ])
  ]);
}

async function loadFilterOptions() {
  let options;
  try {
    options = await fetchApi('/api/jobs/filter-options');
  } catch (error) {
    // Filters are an enhancement; the list itself still works without them.
    return;
  }

  const companySelect = filterForm?.elements.namedItem('companyId');
  const roleSelect = filterForm?.elements.namedItem('roleId');
  const locationList = document.querySelector('#job-location-options');

  if (companySelect) {
    for (const company of options.companies) {
      companySelect.append(el('option', { text: company.companyName, attrs: { value: company.companyId } }));
    }
  }
  if (roleSelect) {
    for (const role of options.roles) {
      roleSelect.append(el('option', { text: role.roleName, attrs: { value: role.roleId } }));
    }
  }
  if (locationList) {
    for (const location of options.locations) {
      locationList.append(el('option', { attrs: { value: location } }));
    }
  }

  // Re-apply any values that came from the address bar now that options exist.
  applyAddressBarToForm();
}

async function loadJobs(page = currentPage) {
  const filters = readFilters();
  currentPage = page;
  syncAddressBar(filters, page);

  statusMessage.textContent = 'Loading open jobs…';
  renderSkeletons(results, 4, 'job');
  clear(paginationHost);

  const params = new URLSearchParams({ ...filters, page: String(page) });

  try {
    const data = await fetchApi(`/api/jobs?${params.toString()}`);
    results.removeAttribute('aria-busy');

    if (countLabel) {
      countLabel.textContent = data.pagination.total === 1
        ? '1 open job'
        : `${data.pagination.total.toLocaleString()} open jobs`;
    }

    if (!data.items.length) {
      statusMessage.textContent = 'No open jobs match these filters.';
      renderEmptyState(results, {
        title: 'No open jobs match these filters',
        message: 'Only published vacancies that are still inside their application deadline appear here. Try clearing the filters.',
        actionLabel: 'Clear filters',
        onAction: () => { filterForm.reset(); loadJobs(1); }
      });
      return;
    }

    statusMessage.textContent = `Showing ${data.items.length} of ${data.pagination.total} open jobs.`;
    results.replaceChildren(...data.items.map(jobCard));
    renderPagination(paginationHost, data.pagination, (nextPage) => {
      loadJobs(nextPage);
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } catch (error) {
    statusMessage.textContent = 'Open jobs could not be loaded.';
    renderErrorState(results, error, () => loadJobs(page));
  }
}

filterForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  loadJobs(1);
});

filterForm?.addEventListener('reset', () => {
  window.setTimeout(() => loadJobs(1), 0);
});

applyAddressBarToForm();
loadFilterOptions().finally(() => loadJobs(currentPage));
