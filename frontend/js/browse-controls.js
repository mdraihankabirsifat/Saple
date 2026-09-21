import { el } from './ui.js';

// Shared behaviour for the five browse pages (Companies, Salaries, Reviews,
// Interviews and Jobs): one filter sidebar that becomes a drawer on tablets
// and phones, an address bar that mirrors the applied filters, an active
// filter count, and the same Apply / Clear / sort / pagination rules.

const DRAWER_QUERY = '(max-width: 1050px)';

// The sidebar is moved into a modal <dialog> while the drawer is open, so it
// gets the browser's own focus containment and Escape handling, then returned
// to its place in the layout when the drawer closes.
export function mountFilterDrawer({ panel, toggle }) {
  const home = panel.parentElement;
  const anchor = panel.nextSibling;
  const mobile = window.matchMedia(DRAWER_QUERY);
  const closeButton = panel.querySelector('[data-filter-close]');
  const countBadge = toggle?.querySelector('[data-filter-count]');
  const dialog = el('dialog', {
    className: 'filter-drawer',
    attrs: { 'aria-label': toggle?.dataset.drawerLabel || 'Filters and sort' }
  });
  document.body.append(dialog);

  function open() {
    dialog.append(panel);
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('filters-open');
    (closeButton || panel.querySelector('input, select, button'))?.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener('close', () => {
    home.insertBefore(panel, anchor && anchor.parentNode === home ? anchor : null);
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('filters-open');
    if (mobile.matches) toggle?.focus();
  });
  // A click on the backdrop (the dialog box itself, outside the panel) closes it.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  toggle?.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  mobile.addEventListener('change', () => { if (!mobile.matches) close(); });

  return {
    close,
    isDrawer: () => mobile.matches,
    setCount(count) {
      if (countBadge) {
        countBadge.textContent = String(count);
        countBadge.hidden = count === 0;
      }
      toggle?.setAttribute('aria-label', count ? `Filters and sort, ${count} active` : 'Filters and sort');
    }
  };
}

// Client-side paging for lists the API returns whole (approved salaries,
// reviews and interviews are bounded, moderated sets).
export function paginateList(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: current, pageSize, total, totalPages }
  };
}

export function describeRange({ page, pageSize, total }, noun) {
  if (!total) return `No ${noun.plural} found.`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const label = total === 1 ? noun.singular : noun.plural;
  return first === 1 && last === total
    ? `Showing ${total.toLocaleString()} ${label}.`
    : `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} ${label}.`;
}

// Wires one filter form to the address bar and a loader.
//   fields   names of the form controls that are filters (plus 'sort')
//   defaults values that count as "no filter" (for example salarySource)
//   load     async (state, controller) => void; state.page is 1-based
export function createBrowseController({ form, toggle, fields, defaults = {}, load }) {
  const drawer = mountFilterDrawer({ panel: form.closest('[data-filter-panel]') || form, toggle });
  const sortControl = form.elements.namedItem('sort');
  let state = { page: 1 };

  function control(name) {
    return form.elements.namedItem(name);
  }

  function readForm() {
    const next = {};
    for (const name of fields) {
      const input = control(name);
      if (!input) continue;
      const value = input.type === 'checkbox' ? (input.checked ? 'true' : '') : String(input.value || '').trim();
      if (value && value !== (defaults[name] || '')) next[name] = value;
    }
    return next;
  }

  // Only known field names are read from the address bar. A select ignores a
  // value it has no option for, so reading the form back drops invalid input.
  function writeForm(values) {
    for (const name of fields) {
      const input = control(name);
      if (!input) continue;
      const value = values[name] ?? defaults[name] ?? '';
      if (input.type === 'checkbox') input.checked = value === 'true';
      else input.value = value;
      if (input.tagName === 'SELECT' && input.selectedIndex < 0) input.value = defaults[name] ?? '';
    }
  }

  function writeAddressBar(push) {
    const params = new URLSearchParams();
    for (const name of fields) if (state.filters[name]) params.set(name, state.filters[name]);
    if (state.page > 1) params.set('page', String(state.page));
    const query = params.toString();
    const url = query ? `?${query}` : window.location.pathname;
    if (url === window.location.search || (!query && !window.location.search)) return;
    window.history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function activeCount() {
    return Object.keys(state.filters).filter((name) => name !== 'sort').length;
  }

  async function run(page, { push = false } = {}) {
    state = { ...state, page: Math.max(1, page) };
    writeAddressBar(push);
    drawer.setCount(activeCount());
    await load(state, controller);
  }

  function readAddressBar() {
    const params = new URLSearchParams(window.location.search);
    const values = {};
    for (const name of fields) {
      const value = params.get(name);
      if (value !== null) values[name] = value.slice(0, 120);
    }
    writeForm(values);
    const page = Number(params.get('page'));
    state = { filters: readForm(), page: Number.isInteger(page) && page > 0 ? page : 1 };
  }

  function apply() {
    if (!form.reportValidity()) return;
    state = { filters: readForm(), page: 1 };
    drawer.close();
    run(1, { push: true });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply();
  });
  // Clear restores every default, resets to page 1 and rewrites the address
  // bar from scratch, so no stale parameter survives.
  form.addEventListener('reset', (event) => {
    event.preventDefault();
    writeForm({});
    state = { filters: readForm(), page: 1 };
    drawer.close();
    run(1, { push: true });
  });
  // On the desktop sidebar a new sort order applies at once; inside the
  // drawer it waits for Apply like every other control.
  sortControl?.addEventListener('change', () => { if (!drawer.isDrawer()) apply(); });
  window.addEventListener('popstate', () => {
    drawer.close();
    readAddressBar();
    run(state.page);
  });

  const controller = {
    start() {
      readAddressBar();
      return run(state.page);
    },
    goTo(page) {
      return run(page, { push: true });
    },
    reload() {
      return run(state.page);
    },
    clear() {
      form.reset();
    },
    get state() {
      return state;
    }
  };
  return controller;
}
