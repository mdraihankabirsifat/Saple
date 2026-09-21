import { fetchApi } from './api.js';
import { clear, renderSkeletons, renderEmptyState, renderErrorState, renderPagination } from './ui.js';
import { buildQuery, companyDetailsLink, createMeta, loadCompanyAndRoleOptions } from './browse-shared.js';
import { createBrowseController, paginateList, describeRange } from './browse-controls.js';

const form = document.querySelector('#review-filters');
const company = document.querySelector('#review-company-filter');
const role = document.querySelector('#review-role-filter');
const location = document.querySelector('#review-location-filter');
const rating = document.querySelector('#review-rating-filter');
const status = document.querySelector('#review-browse-status');
const results = document.querySelector('#review-results');
const paginationHost = document.querySelector('#review-pagination');

function textBlock(title, value) {
  const block = document.createElement('section');
  const heading = document.createElement('h3');
  const text = document.createElement('p');
  block.className = 'content-block';
  heading.textContent = title;
  text.textContent = value || 'Not provided.';
  block.append(heading, text);
  return block;
}

function reviewCard(item) {
  const card = document.createElement('article');
  const heading = document.createElement('h2');
  const grid = document.createElement('div');
  card.className = 'content-card card';
  heading.textContent = item.reviewTitle;
  grid.className = 'content-grid';
  grid.append(textBlock('Pros', item.pros), textBlock('Cons', item.cons));
  if (item.adviceToManagement) grid.append(textBlock('Advice to management', item.adviceToManagement));
  card.append(
    heading,
    createMeta([
      item.companyName,
      item.roleName || 'Role not specified',
      `${item.overallRating}/5 overall`,
      item.verificationStatus === 'VERIFIED' ? 'Verified employee' : null,
      item.authorName || 'Anonymous',
      new Date(item.reviewDate).toLocaleDateString()
    ]),
    grid,
    companyDetailsLink(item.companyId, 'View company and reporting options →')
  );
  return card;
}

const PAGE_SIZE = 10;
const NOUN = {"singular":"review","plural":"reviews"};
// Sorting happens in the browser over the approved set the API returned; the
// server keeps its own stable order and receives only the filters it accepts.
const SORTS = {
  newest: () => 0,
  'rating-desc': (a, b) => Number(b.overallRating) - Number(a.overallRating),
  'rating-asc': (a, b) => Number(a.overallRating) - Number(b.overallRating),
  company: (a, b) => a.companyName.localeCompare(b.companyName)
};
let cached = { query: null, items: [] };

async function load(state, controller) {
  const filters = state.filters;
  const query = buildQuery([['companyId', filters.companyId], ['roleId', filters.roleId], ['location', filters.location], ['minRating', filters.minRating]]);
  status.classList.remove('error');
  status.textContent = "Loading approved reviews…";
  clear(paginationHost);
  if (cached.query !== query) renderSkeletons(results, 3, 'card');

  try {
    if (cached.query !== query) cached = { query, items: await fetchApi(`/api/reviews${query}`) };
    const sorted = [...cached.items].sort(SORTS[filters.sort] || SORTS['newest']);
    const { items, pagination } = paginateList(sorted, state.page, PAGE_SIZE);
    status.textContent = describeRange(pagination, NOUN);
    results.removeAttribute('aria-busy');
    if (!items.length) {
      renderEmptyState(results, {
        title: "No approved reviews match these filters",
        message: "Try another company, a lower minimum rating, or clear the filters.",
        actionLabel: 'Clear filters',
        onAction: () => controller.clear()
      });
      return;
    }
    results.replaceChildren(...items.map(reviewCard));
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
  fields: ['companyId', 'roleId', 'location', 'minRating', 'sort'],
  defaults: { sort: 'newest' },
  load
});

(async () => {
  try { await loadCompanyAndRoleOptions(company, role); } catch { /* Filters still work without the lookups. */ }
  await browse.start();
})();
