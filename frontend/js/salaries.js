import { fetchApi } from './api.js';
import { buildQuery, companyDetailsLink, loadCompanyAndRoleOptions } from './browse-shared.js';

const form = document.querySelector('#salary-filters');
const company = document.querySelector('#salary-company-filter');
const role = document.querySelector('#salary-role-filter');
const location = document.querySelector('#salary-location-filter');
const source = document.querySelector('#salary-source-filter');
const minimum = document.querySelector('#salary-min-filter');
const maximum = document.querySelector('#salary-max-filter');
const status = document.querySelector('#salary-browse-status');
const results = document.querySelector('#salary-results');

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

async function load() {
  results.replaceChildren();
  status.hidden = false;
  status.classList.remove('error');
  status.textContent = 'Loading approved salary insights…';
  const query = buildQuery([
    ['companyId', company.value], ['roleId', role.value], ['location', location.value],
    ['salarySource', source.value], ['minSalary', minimum.value], ['maxSalary', maximum.value]
  ]);
  try {
    const items = await fetchApi(`/api/salaries${query}`);
    if (!items.length) {
      status.textContent = 'No approved salary data matches these filters.';
      return;
    }
    status.hidden = true;
    items.forEach((item) => results.append(salaryCard(item)));
  } catch (error) { status.textContent = error.message; status.classList.add('error'); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
form.addEventListener('reset', () => setTimeout(load));

(async () => {
  try { await loadCompanyAndRoleOptions(company, role); } catch (error) { status.textContent = error.message; }
  await load();
})();
