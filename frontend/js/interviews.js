import { fetchApi } from './api.js';
import { buildQuery, companyDetailsLink, createMeta, loadCompanyAndRoleOptions } from './browse-shared.js';

const form = document.querySelector('#interview-filters');
const company = document.querySelector('#interview-company-filter');
const role = document.querySelector('#interview-role-filter');
const location = document.querySelector('#interview-location-filter');
const difficulty = document.querySelector('#interview-difficulty-filter');
const mode = document.querySelector('#interview-mode-filter');
const status = document.querySelector('#interview-browse-status');
const results = document.querySelector('#interview-results');

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
  grid.append(textBlock('Process', item.processDescription), textBlock('Questions or topics', item.questionsSummary));
  card.append(
    heading,
    createMeta([
      item.difficultyLevel, `${item.roundsCount} round${item.roundsCount === 1 ? '' : 's'}`,
      item.interviewMode, item.resultStatus, `${item.durationDays} day${item.durationDays === 1 ? '' : 's'}`,
      item.verificationStatus === 'VERIFIED' ? 'Verified employee' : null,
      item.authorName || 'Anonymous', new Date(item.interviewDate).toLocaleDateString()
    ]),
    grid,
    companyDetailsLink(item.companyId, 'View company and reporting options →')
  );
  return card;
}

async function load() {
  results.replaceChildren(); status.hidden = false; status.textContent = 'Loading approved interview experiences…';
  const query = buildQuery([
    ['companyId', company.value], ['roleId', role.value], ['location', location.value],
    ['difficultyLevel', difficulty.value], ['interviewMode', mode.value]
  ]);
  try {
    const items = await fetchApi(`/api/interviews${query}`);
    if (!items.length) { status.textContent = 'No approved interview experiences match these filters.'; return; }
    status.hidden = true; items.forEach((item) => results.append(interviewCard(item)));
  } catch (error) { status.textContent = error.message; status.classList.add('error'); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
form.addEventListener('reset', () => setTimeout(load));
(async () => { try { await loadCompanyAndRoleOptions(company, role); } catch (error) { status.textContent = error.message; } await load(); })();
