export const PAGE_SIZE = 20;
export const SORT_OPTIONS = ['name-asc', 'name-desc', 'rating-desc', 'rating-asc', 'salary-desc', 'salary-asc'];

export function sortCompanies(companies, sort = 'name-asc', source = 'COMMUNITY') {
  const byName = (a, b) => (a.companyName || '').localeCompare(b.companyName || '', 'en', { sensitivity: 'base', numeric: true })
    || String(a.companyId).localeCompare(String(b.companyId), 'en', { numeric: true });
  const descending = sort.endsWith('-desc');
  const prefix = source === 'VERIFIED' ? 'verified' : 'community';
  function metric(company) {
    const count = sort.startsWith('rating') ? company.reviewCount : company[`${prefix}SalaryCount`];
    const value = sort.startsWith('rating') ? company.averageRating
      : company[`${prefix}${descending ? 'Maximum' : 'Minimum'}Salary`];
    return Number(count) > 0 && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  }
  return [...companies].sort((a, b) => {
    if (!SORT_OPTIONS.includes(sort) || sort.startsWith('name')) return byName(a, b) * (sort === 'name-desc' ? -1 : 1);
    const left = metric(a); const right = metric(b);
    if (left === null || right === null) return left === right ? byName(a, b) : left === null ? 1 : -1;
    return (left - right) * (descending ? -1 : 1) || byName(a, b);
  });
}

export function paginate(companies, requestedPage) {
  const pages = Math.max(1, Math.ceil(companies.length / PAGE_SIZE));
  const parsed = Number(requestedPage);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(parsed) ? parsed : 1));
  const offset = (page - 1) * PAGE_SIZE;
  return { page, pages, total: companies.length, start: companies.length ? offset + 1 : 0,
    end: Math.min(offset + PAGE_SIZE, companies.length), items: companies.slice(offset, offset + PAGE_SIZE) };
}

export function pageNumbers(current, total) {
  const visible = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => visible.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => visible.add(page));
  const result = [];
  [...visible].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b).forEach((page) => {
    const previous = result.at(-1);
    if (previous && page - previous === 2) result.push(previous + 1);
    else if (previous && page - previous > 2) result.push('…');
    result.push(page);
  });
  return result;
}
