import { fetchApi } from './api.js';

function appendOptions(select, items, valueKey, labelKey) {
  items.forEach((item) => {
    if (item[valueKey] !== null && item[valueKey] !== undefined && item[labelKey]) {
      select.append(new Option(item[labelKey], String(item[valueKey])));
    }
  });
}

async function loadCompanyAndRoleOptions(companySelect, roleSelect) {
  const [companies, roles] = await Promise.all([
    fetchApi('/api/companies'),
    fetchApi('/api/job-roles')
  ]);
  appendOptions(companySelect, companies, 'companyId', 'companyName');
  appendOptions(roleSelect, roles, 'roleId', 'roleName');
}

function buildQuery(entries) {
  const query = new URLSearchParams();
  entries.forEach(([name, value]) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized !== '' && normalized !== null && normalized !== undefined) {
      query.set(name, normalized);
    }
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

function createMeta(values) {
  const meta = document.createElement('div');
  meta.className = 'content-meta';
  values.filter(Boolean).forEach((value) => {
    const item = document.createElement('span');
    item.textContent = value;
    meta.append(item);
  });
  return meta;
}

function companyDetailsLink(companyId, label = 'View company details →') {
  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = `company-details.html?id=${encodeURIComponent(companyId)}`;
  link.textContent = label;
  return link;
}

export {
  loadCompanyAndRoleOptions,
  buildQuery,
  createMeta,
  companyDetailsLink
};
