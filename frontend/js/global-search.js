import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import { el } from './ui.js';
import { premiumBadge } from './premium-ui.js';

const MIN_LENGTH = 2;
const MAX_LENGTH = 80;
const DEBOUNCE_MS = 280;

function imageOrInitial(url, name) {
  const wrap = el('span', { className: 'nav-search-avatar' });
  if (url) {
    const image = el('img', { attrs: { src: url, alt: '' } });
    image.addEventListener('error', () => { image.remove(); wrap.textContent = name[0]?.toUpperCase() || 'S'; });
    wrap.append(image);
  } else wrap.textContent = name[0]?.toUpperCase() || 'S';
  return wrap;
}

function userEntry(user) {
  return { href: `user-profile.html?id=${encodeURIComponent(user.userId)}`, name: user.fullName,
    detail: user.headline || user.displayLabel || '', imageUrl: user.avatarUrl, badge: user.premiumBadge };
}

function companyEntry(company) {
  return { href: `company-details.html?id=${encodeURIComponent(company.companyId)}`, name: company.companyName,
    detail: [company.industry, company.city].filter(Boolean).join(' · '), imageUrl: company.logoUrl };
}

// One search endpoint for every visitor. A signed-in visitor's token is sent
// only so their own account is left out of the people results.
function searchRequest(query, scope) {
  const params = new URLSearchParams({ q: query });
  if (scope) params.set('scope', scope);
  return apiRequest(`/api/search?${params}`, { auth: isAuthenticated() });
}

// A combobox dropdown: debounced live results, arrow keys, Enter, Escape and
// click-outside. `load` returns groups of { label, entries } for a query.
function attachDropdown({ host, input, results, idPrefix, load, emptyText, clipTo = null }) {
  let timer;
  let sequence = 0;
  let selected = -1;
  let links = [];

  function close() {
    ++sequence;
    clearTimeout(timer);
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    selected = -1;
  }
  function open() {
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    // Inside a container that clips its overflow, the list scrolls rather
    // than running past that container's edge.
    const clip = clipTo && host.closest(clipTo);
    if (clip) {
      const space = clip.getBoundingClientRect().bottom - results.getBoundingClientRect().top - 12;
      results.style.setProperty('max-height', `${Math.max(140, Math.min(304, Math.floor(space)))}px`);
    }
  }
  function highlight(index) {
    selected = (index + links.length) % links.length;
    links.forEach((link, position) => link.setAttribute('aria-selected', String(position === selected)));
    input.setAttribute('aria-activedescendant', links[selected].id);
    links[selected].scrollIntoView({ block: 'nearest' });
  }
  function group({ label, entries }) {
    if (!entries.length) return null;
    const section = el('section', { className: 'nav-search-group' }, [el('h3', { text: label })]);
    for (const entry of entries) {
      const link = el('a', { className: 'nav-search-result', attrs: {
        href: entry.href, role: 'option', id: `${idPrefix}-option-${links.length}`, 'aria-selected': 'false'
      } }, [
        imageOrInitial(entry.imageUrl, entry.name),
        el('span', { className: 'nav-search-copy' }, [
          el('strong', {}, [entry.name, entry.badge ? ' ' : null, premiumBadge(entry.badge)]),
          entry.detail ? el('small', { text: entry.detail }) : null
        ])
      ]);
      links.push(link);
      section.append(link);
    }
    return section;
  }
  function show(nodes) {
    results.replaceChildren(...nodes);
    open();
  }
  async function search() {
    const query = input.value.trim();
    const current = ++sequence;
    try {
      const groups = await load(query);
      if (current !== sequence) return;
      links = [];
      selected = -1;
      input.removeAttribute('aria-activedescendant');
      const sections = groups.map(group).filter(Boolean);
      show(links.length ? sections : [el('p', { className: 'nav-search-empty', text: emptyText })]);
    } catch (error) {
      if (current !== sequence) return;
      links = [];
      show([el('p', { className: 'nav-search-empty', text: error.message || 'Search is unavailable right now.' })]);
    }
  }
  function queryReady() {
    const length = input.value.trim().length;
    return length >= MIN_LENGTH && length <= MAX_LENGTH;
  }

  input.addEventListener('input', () => {
    ++sequence;
    clearTimeout(timer);
    if (!queryReady()) { close(); results.replaceChildren(); links = []; return; }
    timer = setTimeout(search, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!results.hidden) event.preventDefault();
      close();
      return;
    }
    if (results.hidden || !links.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(selected < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
        : selected + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && selected >= 0) {
      // Without a highlighted result, Enter keeps its normal meaning.
      event.preventDefault();
      links[selected].click();
    }
  });
  document.addEventListener('click', (event) => { if (!host.contains(event.target)) close(); });
  input.addEventListener('focus', () => { if (queryReady() && results.childElementCount) open(); });
}

function comboboxAttributes(input, resultsId, label) {
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', resultsId);
  input.setAttribute('autocomplete', 'off');
  if (label) input.setAttribute('aria-label', label);
}

let mounted = false;

// The navbar search: members and companies, for every visitor.
export function mountGlobalSearch(actions, before = null) {
  if (mounted || !actions) return;
  mounted = true;
  const input = el('input', { className: 'nav-search-input', attrs: {
    type: 'search', placeholder: 'Search people or companies', maxlength: String(MAX_LENGTH)
  } });
  comboboxAttributes(input, 'saple-global-results', 'Search people or companies');
  const results = el('div', { className: 'nav-search-results', attrs: {
    id: 'saple-global-results', role: 'listbox', hidden: true
  } });
  const host = el('div', { className: 'nav-search' }, [input, results]);
  actions.insertBefore(host, before);
  attachDropdown({ host, input, results, idPrefix: 'saple-global', emptyText: 'No matches found.',
    load: async (query) => {
      const data = await searchRequest(query);
      return [
        { label: 'People', entries: (data.users || []).map(userEntry) },
        { label: 'Companies', entries: (data.companies || []).map(companyEntry) }
      ];
    } });
}

// The homepage hero search: live company recommendations under the field. The
// form itself still submits to the company directory as before.
export function mountHeroSearch(form) {
  const input = form?.querySelector('input[type="search"]');
  if (!input || form.dataset.liveSearch) return;
  form.dataset.liveSearch = 'true';
  const results = el('div', { className: 'nav-search-results hero-search-results', attrs: {
    id: 'hero-search-results', role: 'listbox', 'aria-label': 'Matching companies', hidden: true
  } });
  comboboxAttributes(input, results.id);
  form.append(results);
  attachDropdown({ host: form, input, results, idPrefix: 'hero-search', clipTo: '.home-hero',
    emptyText: 'No matching companies. Press Search to browse the directory.',
    load: async (query) => {
      const data = await searchRequest(query, 'companies');
      return [{ label: 'Companies', entries: (data.companies || []).map(companyEntry) }];
    } });
}
