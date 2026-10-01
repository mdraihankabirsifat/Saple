import { apiRequest } from './api.js';
import { lockedQuestions } from './premium-ui.js';
import { clear, renderSkeletons, renderEmptyState, renderErrorState, renderPagination } from './ui.js';
import { buildQuery, companyDetailsLink, createMeta, loadCompanyAndRoleOptions } from './browse-shared.js';
import { createBrowseController, paginateList, describeRange } from './browse-controls.js';
import { sortByPopularity } from './popularity.js';

const form = document.querySelector('#interview-filters');
const company = document.querySelector('#interview-company-filter');
const role = document.querySelector('#interview-role-filter');
const location = document.querySelector('#interview-location-filter');
const difficulty = document.querySelector('#interview-difficulty-filter');
const mode = document.querySelector('#interview-mode-filter');
const status = document.querySelector('#interview-browse-status');
const results = document.querySelector('#interview-results');
const paginationHost = document.querySelector('#interview-pagination');

function textBlock(title, value) {
  const block = document.createElement('section');
  const heading = document.createElement('h3');
  const text = document.createElement('p');
  block.className = 'content-block'; heading.textContent = title; text.textContent = value || 'Not provided.';
  block.append(heading, text); return block;
}

function interviewCard(item) {
  const card = document.createElement('article');
  const heading = document.createElement('h2');
  const grid = document.createElement('div');
  card.className = 'content-card card'; heading.textContent = `${item.companyName} · ${item.roleName}`;
  grid.className = 'content-grid';
  if (item.awaitingModeratorReview) {
    const pending = document.createElement('span');
    pending.className = 'badge moderation-pending';
    pending.textContent = 'Awaiting moderator review';
    heading.append(' ', pending);
  }
  const questions = textBlock('Questions or topics', item.questionsSummary);
  // Without Premium the API sends only a short preview, never the full text.
  if (item.questionsLocked) questions.querySelector('p').replaceWith(lockedQuestions(item.questionsPreview));
  grid.append(textBlock('Process', item.processDescription), questions);
  card.append(
    heading,
    createMeta([
      item.difficultyLevel, `${item.roundsCount} round${item.roundsCount === 1 ? '' : 's'}`,
      item.interviewMode, item.resultStatus, `${item.durationDays} day${item.durationDays === 1 ? '' : 's'}`,
      item.verificationStatus === 'VERIFIED' ? 'Verified employee' : null,
      item.authorName || 'Anonymous', new Date(item.interviewDate).toLocaleDateString()
    ]),
    grid,
    companyDetailsLink(item.companyId, 'View company and reporting options')
  );
  return card;
}

const PAGE_SIZE = 10;
const NOUN = {"singular":"interview experience","plural":"interview experiences"};
// Sorting happens in the browser over the approved set the API returned; the
// server keeps its own stable order and receives only the filters it accepts.
const SORTS = {
  newest: () => 0,
  'interview-date': (a, b) => String(b.interviewDate || '').localeCompare(String(a.interviewDate || '')),
  company: (a, b) => a.companyName.localeCompare(b.companyName)
};
let cached = { query: null, items: [] };

async function load(state, controller) {
  const filters = state.filters;
  const query = buildQuery([['companyId', filters.companyId], ['roleId', filters.roleId], ['location', filters.location], ['difficultyLevel', filters.difficultyLevel], ['interviewMode', filters.interviewMode]]);
  status.classList.remove('error');
  status.textContent = "Loading approved interview experiences…";
  clear(paginationHost);
  if (cached.query !== query) renderSkeletons(results, 3, 'card');

  try {
    if (cached.query !== query) cached = { query, items: await apiRequest(`/api/interviews${query}`, { auth: 'optional' }) };
    // Popular (default): company and role density plus recency (popularity.js).
    const sorted = filters.sort in SORTS ? [...cached.items].sort(SORTS[filters.sort])
      : sortByPopularity(cached.items, (item) => `${item.companyId}:${item.roleId}`);
    const { items, pagination } = paginateList(sorted, state.page, PAGE_SIZE);
    status.textContent = describeRange(pagination, NOUN);
    results.removeAttribute('aria-busy');
    if (!items.length) {
      renderEmptyState(results, {
        title: "No approved interview experiences match these filters",
        message: "Try another company or role, or clear the filters.",
        actionLabel: 'Clear filters',
        onAction: () => controller.clear()
      });
      return;
    }
    results.replaceChildren(...items.map(interviewCard));
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
  fields: ['companyId', 'roleId', 'location', 'difficultyLevel', 'interviewMode', 'sort'],
  defaults: { sort: 'popular' },
  load
});

(async () => {
  try { await loadCompanyAndRoleOptions(company, role); } catch { /* Filters still work without the lookups. */ }
  await browse.start();
})();
