import { fetchApi } from './api.js';
import {
  el, clear, renderSkeletons, renderEmptyState, renderErrorState,
  renderPagination, formatDate, formatSalaryRange, humanizeEnum
} from './ui.js';
import { createCompanyLogo } from './company-logo.js';
import { createBrowseController } from './browse-controls.js';

const results = document.querySelector('#job-results');
const statusMessage = document.querySelector('#job-status');
const paginationHost = document.querySelector('#job-pagination');
const filterForm = document.querySelector('#job-filters');
const countLabel = document.querySelector('#job-count');

const FILTER_FIELDS = ['search', 'companyId', 'roleId', 'location', 'workMode', 'employmentType', 'sort'];

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

}

async function loadJobs(state, controller) {
  statusMessage.classList.remove('error');
  statusMessage.textContent = 'Loading open jobs…';
  renderSkeletons(results, 4, 'job');
  clear(paginationHost);

  // Only the validated filter names reach the query string; the server checks
  // every value again, including the sort name.
  const params = new URLSearchParams({ ...state.filters, page: String(state.page) });

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
        onAction: () => controller.clear()
      });
      return;
    }

    const first = (data.pagination.page - 1) * data.pagination.pageSize + 1;
    const last = first + data.items.length - 1;
    statusMessage.textContent = first === 1 && last === data.pagination.total
      ? `Showing ${data.pagination.total} open job${data.pagination.total === 1 ? '' : 's'}.`
      : `Showing ${first}–${last} of ${data.pagination.total} open jobs.`;
    results.replaceChildren(...data.items.map(jobCard));
    renderPagination(paginationHost, data.pagination, (nextPage) => {
      controller.goTo(nextPage);
      results.closest('section')?.scrollIntoView({ block: 'start' });
    });
  } catch (error) {
    statusMessage.textContent = 'Open jobs could not be loaded.';
    statusMessage.classList.add('error');
    renderErrorState(results, error, () => controller.reload());
  }
}

const browse = createBrowseController({
  form: filterForm,
  toggle: document.querySelector('[data-filter-toggle]'),
  fields: FILTER_FIELDS,
  defaults: { sort: 'NEWEST' },
  load: loadJobs
});

loadFilterOptions().catch(() => {}).finally(() => browse.start());
