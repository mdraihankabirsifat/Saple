import { apiRequest } from './api.js';
import { el } from './ui.js';

let mounted = false;

function imageOrInitial(item, name, kind) {
  const wrap = el('span', { className: 'nav-search-avatar' });
  const url = kind === 'user' ? item.avatarUrl : item.logoUrl;
  if (url) {
    const image = el('img', { attrs: { src: url, alt: '' } });
    image.addEventListener('error', () => { image.remove(); wrap.textContent = name[0]?.toUpperCase() || 'S'; });
    wrap.append(image);
  } else wrap.textContent = name[0]?.toUpperCase() || 'S';
  return wrap;
}

export function mountGlobalSearch(actions, before = null) {
  if (mounted || !actions) return;
  mounted = true;
  const input = el('input', { className: 'nav-search-input', attrs: {
    type: 'search', placeholder: 'Search people or companies',
    'aria-label': 'Search people or companies', 'aria-expanded': 'false',
    'aria-controls': 'saple-global-results', role: 'combobox', autocomplete: 'off', maxlength: '80'
  } });
  const results = el('div', { className: 'nav-search-results', attrs: {
    id: 'saple-global-results', role: 'listbox', hidden: true
  } });
  const host = el('div', { className: 'nav-search' }, [input, results]);
  actions.insertBefore(host, before);
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
  function highlight(index) {
    selected = (index + links.length) % links.length;
    links.forEach((link, position) => link.setAttribute('aria-selected', String(position === selected)));
    input.setAttribute('aria-activedescendant', links[selected].id);
    links[selected].scrollIntoView({ block: 'nearest' });
  }
  function group(label, items, kind) {
    const section = el('section', { className: 'nav-search-group' }, [
      el('h3', { text: label })
    ]);
    for (const item of items) {
      const name = kind === 'user' ? item.fullName : item.companyName;
      const href = kind === 'user' ? `user-profile.html?id=${encodeURIComponent(item.userId)}`
        : `company-details.html?id=${encodeURIComponent(item.companyId)}`;
      const link = el('a', { className: 'nav-search-result', attrs: {
        href, role: 'option', id: `saple-global-option-${links.length}`, 'aria-selected': 'false'
      } }, [
        imageOrInitial(item, name, kind),
        el('span', { className: 'nav-search-copy' }, [
          el('strong', { text: name }),
          kind === 'user' ? null : el('small', { text: item.industry || '' })
        ])
      ]);
      links.push(link);
      section.append(link);
    }
    return section;
  }
  async function search() {
    const q = input.value.trim();
    const current = ++sequence;
    if (q.length < 2) { close(); results.replaceChildren(); return; }
    try {
      const data = await apiRequest(`/api/search?q=${encodeURIComponent(q)}`, { auth: true });
      if (current !== sequence) return;
      links = [];
      results.replaceChildren(
        group('People', data.users || [], 'user'),
        group('Companies', data.companies || [], 'company')
      );
      if (!links.length) results.append(el('p', { className: 'nav-search-empty', text: 'No matches found.' }));
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    } catch (error) {
      if (current !== sequence) return;
      links = [];
      results.replaceChildren(el('p', { className: 'nav-search-empty', text: error.message || 'Search unavailable.' }));
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
  }
  input.addEventListener('input', () => {
    ++sequence;
    clearTimeout(timer);
    if (input.value.trim().length < 2) { close(); results.replaceChildren(); return; }
    timer = setTimeout(search, 280);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); return; }
    if (results.hidden || !links.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlight(selected < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
        : selected + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && selected >= 0) {
      event.preventDefault();
      links[selected].click();
    }
  });
  document.addEventListener('click', (event) => { if (!host.contains(event.target)) close(); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && results.childElementCount) {
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
  } });
}
