import { fetchApi } from './api.js';
import { buildQuery, companyDetailsLink, createMeta, loadCompanyAndRoleOptions } from './browse-shared.js';

const form = document.querySelector('#review-filters');
const company = document.querySelector('#review-company-filter');
const role = document.querySelector('#review-role-filter');
const location = document.querySelector('#review-location-filter');
const rating = document.querySelector('#review-rating-filter');
const status = document.querySelector('#review-browse-status');
const results = document.querySelector('#review-results');

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

async function load() {
  results.replaceChildren(); status.hidden = false; status.textContent = 'Loading approved reviews…';
  const query = buildQuery([
    ['companyId', company.value], ['roleId', role.value], ['location', location.value], ['minRating', rating.value]
  ]);
  try {
    const items = await fetchApi(`/api/reviews${query}`);
    if (!items.length) { status.textContent = 'No approved reviews match these filters.'; return; }
    status.hidden = true; items.forEach((item) => results.append(reviewCard(item)));
  } catch (error) { status.textContent = error.message; status.classList.add('error'); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
form.addEventListener('reset', () => setTimeout(load));
(async () => { try { await loadCompanyAndRoleOptions(company, role); } catch (error) { status.textContent = error.message; } await load(); })();
