import { fetchApi } from './api.js';
import { clear, renderSkeletons, renderEmptyState, renderErrorState, renderPagination } from './ui.js';
import { buildQuery, companyDetailsLink, loadCompanyAndRoleOptions } from './browse-shared.js';
import { createBrowseController, paginateList, describeRange } from './browse-controls.js';

const form = document.querySelector('#salary-filters');
const company = document.querySelector('#salary-company-filter');
const role = document.querySelector('#salary-role-filter');
const location = document.querySelector('#salary-location-filter');
const source = document.querySelector('#salary-source-filter');
const minimum = document.querySelector('#salary-min-filter');
const maximum = document.querySelector('#salary-max-filter');
const status = document.querySelector('#salary-browse-status');
const results = document.querySelector('#salary-results');
const paginationHost = document.querySelector('#salary-pagination');

function money(value, currency) {
  if (value === null || value === undefined) return 'No salary data';
  try {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch (error) {
    return `${Number(value).toLocaleString()} ${currency}`;
  }
}

function rangePanel(title, item, prefix) {
  const section = document.createElement('section');
  const heading = document.createElement('h3');
  const range = document.createElement('strong');
  const detail = document.createElement('p');
  const count = item[`${prefix}ContributionCount`] || 0;
  section.className = 'salary-range';
  heading.textContent = title;
  range.textContent = count
    ? `${money(item[`${prefix}MinimumSalary`], item.currency)} – ${money(item[`${prefix}MaximumSalary`], item.currency)}`
    : 'No salary data';
  detail.textContent = count
    ? `${count} approved contribution${count === 1 ? '' : 's'} · average ${money(item[`${prefix}AverageSalary`], item.currency)}`
    : 'No approved submissions for this source.';
  section.append(heading, range, detail);
  return section;
}

function salaryCard(item) {
  const card = document.createElement('article');
  const headingRow = document.createElement('div');
  const titleGroup = document.createElement('div');
  const heading = document.createElement('h2');
  const subtitle = document.createElement('p');
  const period = document.createElement('span');
  const ranges = document.createElement('div');
  card.className = 'insight-card card';
  headingRow.className = 'card-heading-row';
  heading.textContent = item.companyName;
  subtitle.textContent = `${item.roleName} · ${[item.headquartersCity, item.country].filter(Boolean).join(', ')}`;
  period.className = 'badge';
  period.textContent = `${item.currency} / ${item.payPeriod.toLowerCase()}`;
  titleGroup.append(heading, subtitle);
  headingRow.append(titleGroup, period);
  ranges.className = 'salary-ranges';
  ranges.append(rangePanel('Verified salary range', item, 'verified'), rangePanel('Community salary range', item, 'community'));
  card.append(headingRow, ranges, companyDetailsLink(item.companyId));
  return card;
}

const PAGE_SIZE = 10;
const NOUN = {"singular":"salary insight","plural":"salary insights"};
// Sorting happens in the browser over the approved set the API returned; the
// server keeps its own stable order and receives only the filters it accepts.
const SORTS = {
  company: (a, b) => a.companyName.localeCompare(b.companyName) || a.roleName.localeCompare(b.roleName),
  'salary-desc': (a, b) => (b.communityMaximumSalary ?? -1) - (a.communityMaximumSalary ?? -1),
  'salary-asc': (a, b) => (a.communityMinimumSalary ?? Infinity) - (b.communityMinimumSalary ?? Infinity),
  contributions: (a, b) => (b.communityContributionCount || 0) - (a.communityContributionCount || 0)
};
let cached = { query: null, items: [] };

async function load(state, controller) {
  const filters = state.filters;
  const query = buildQuery([['companyId', filters.companyId], ['roleId', filters.roleId], ['location', filters.location], ['salarySource', filters.salarySource], ['minSalary', filters.minSalary], ['maxSalary', filters.maxSalary]]);
  status.classList.remove('error');
  status.textContent = "Loading approved salary insights…";
  clear(paginationHost);
  if (cached.query !== query) renderSkeletons(results, 3, 'card');

  try {
    if (cached.query !== query) cached = { query, items: await fetchApi(`/api/salaries${query}`) };
    const sorted = [...cached.items].sort(SORTS[filters.sort] || SORTS['company']);
    const { items, pagination } = paginateList(sorted, state.page, PAGE_SIZE);
    status.textContent = describeRange(pagination, NOUN);
    results.removeAttribute('aria-busy');
    if (!items.length) {
      renderEmptyState(results, {
        title: "No approved salary data matches these filters",
        message: "Try a wider salary range, another location, or clear the filters.",
        actionLabel: 'Clear filters',
        onAction: () => controller.clear()
      });
      return;
    }
    results.replaceChildren(...items.map(salaryCard));
    renderPagination(paginationHost, pagination, (page) => {
      controller.goTo(page);
      results.closest('section')?.scrollIntoView({ block: 'start' });
    });
  } catch (error) {
    cached = { query: null, items: [] };
    status.textContent = 'Results could not be loaded.';
    status.classList.add('error');
    renderErrorState(results, error, () => controller.reload());
  }
}

const browse = createBrowseController({
  form,
  toggle: document.querySelector('[data-filter-toggle]'),
  fields: ['companyId', 'roleId', 'location', 'salarySource', 'minSalary', 'maxSalary', 'sort'],
  defaults: { salarySource: 'COMMUNITY', sort: 'company' },
  load
});

(async () => {
  try { await loadCompanyAndRoleOptions(company, role); } catch { /* Filters still work without the lookups. */ }
  await browse.start();
})();
