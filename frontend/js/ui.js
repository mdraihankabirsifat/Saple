// Shared DOM helpers.
//
// Everything Saple renders is built with createElement and textContent. No
// helper in this file accepts or produces HTML, so API content and AI output
// cannot become markup even if they contain angle brackets.

export function el(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  const { className, text, attrs, dataset } = options;

  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (dataset) {
    for (const [name, value] of Object.entries(dataset)) node.dataset[name] = String(value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  if (node) node.replaceChildren();
  return node;
}

// Loading placeholders that occupy the same space as the real cards, so the
// page does not jump when data arrives.
export function renderSkeletons(container, count = 4, variant = 'card') {
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  container.replaceChildren(...Array.from({ length: count }, () => el('div', {
    className: `skeleton skeleton-${variant}`,
    attrs: { 'aria-hidden': 'true' }
  }, [
    el('span', { className: 'skeleton-line skeleton-line-lead' }),
    el('span', { className: 'skeleton-line' }),
    el('span', { className: 'skeleton-line skeleton-line-short' })
  ])));
}

export function renderEmptyState(container, { title, message, actionLabel, onAction } = {}) {
  if (!container) return;
  container.removeAttribute('aria-busy');
  const actions = actionLabel && onAction
    ? el('button', { className: 'button button-secondary', text: actionLabel, attrs: { type: 'button' } })
    : null;
  if (actions) actions.addEventListener('click', onAction);

  container.replaceChildren(el('div', { className: 'state-panel state-empty', attrs: { role: 'status' } }, [
    el('h2', { className: 'state-panel-title', text: title || 'Nothing to show yet' }),
    el('p', { className: 'state-panel-text', text: message || 'There is no data for this view right now.' }),
    actions
  ]));
}

// Error states name the failure kind, say what the reader can do about it and
// always offer Retry. Technical detail is shown only on a local development
// host, never on a deployed site.
const RECOVERY_HINTS = {
  NETWORK: 'Check your connection, then try again. If you are running Saple locally, make sure the backend is started.',
  TIMEOUT: 'A free hosting plan can take a few seconds to wake up. Try again in a moment.',
  CORS: 'Open Saple through the backend at http://localhost:3000, or add this page origin to the CORS_ORIGINS setting.',
  INVALID_RESPONSE: 'The address answered with something other than JSON. Confirm that the API base URL points at the Saple backend.',
  SERVER: 'This is a problem on the Saple side. Trying again usually helps.',
  DATABASE: 'The database is not reachable. Public pages may show previously saved data until it returns.',
  AUTH: 'Sign in again to continue.',
  FORBIDDEN: 'Your account does not have access to this view.',
  NOT_FOUND: 'It may have been closed, withdrawn or removed.',
  CONFLICT: 'Refresh the page to see the current state before trying again.',
  RATE_LIMITED: 'Wait a moment before trying again.'
};

export function renderErrorState(container, error, onRetry) {
  if (!container) return;
  container.removeAttribute('aria-busy');

  const kind = error?.kind || 'SERVER';
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const retry = el('button', {
    className: 'button button-primary',
    text: 'Retry',
    attrs: { type: 'button' }
  });
  if (onRetry) retry.addEventListener('click', onRetry);

  const signIn = kind === 'AUTH'
    ? el('a', { className: 'button button-secondary', text: 'Sign in', attrs: { href: 'login.html' } })
    : null;

  container.replaceChildren(el('div', {
    className: 'state-panel state-error',
    attrs: { role: 'alert' },
    dataset: { errorKind: kind }
  }, [
    el('h2', { className: 'state-panel-title', text: 'We could not load this' }),
    el('p', { className: 'state-panel-text', text: error?.message || 'Something went wrong.' }),
    el('p', { className: 'state-panel-hint', text: RECOVERY_HINTS[kind] || RECOVERY_HINTS.SERVER }),
    el('div', { className: 'state-panel-actions' }, [onRetry ? retry : null, signIn]),
    // Status codes help while developing and tell a visitor nothing useful.
    isLocal && error?.status
      ? el('p', { className: 'state-panel-debug', text: `Development detail: ${kind} (HTTP ${error.status})` })
      : null
  ]));
}

// One polite live region per page for short confirmations and failures.
let toastRegion = null;

export function showToast(message, tone = 'info') {
  if (!toastRegion) {
    toastRegion = el('div', {
      className: 'toast-region',
      attrs: { role: 'status', 'aria-live': 'polite' }
    });
    document.body.append(toastRegion);
  }

  const toast = el('p', { className: `toast toast-${tone}`, text: message });
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 6000);
  return toast;
}

// Compact page list: 1 … 4 5 6 … 20, matching the company directory.
export function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output = [];
  let previous = 0;
  for (const page of ordered) {
    if (previous && page - previous > 1) output.push('…');
    output.push(page);
    previous = page;
  }
  return output;
}

export function renderPagination(container, pagination, onPage) {
  if (!container) return;
  clear(container);
  if (!pagination || pagination.totalPages <= 1) return;

  const nav = el('nav', { className: 'pagination', attrs: { 'aria-label': 'Pagination' } });
  const previous = el('button', {
    className: 'pagination-step',
    text: 'Previous',
    attrs: { type: 'button', disabled: pagination.page <= 1 }
  });
  previous.addEventListener('click', () => onPage(pagination.page - 1));
  nav.append(previous);

  for (const page of pageNumbers(pagination.page, pagination.totalPages)) {
    if (page === '…') {
      nav.append(el('span', { className: 'pagination-gap', text: '…', attrs: { 'aria-hidden': 'true' } }));
      continue;
    }
    const button = el('button', {
      className: `pagination-page${page === pagination.page ? ' is-current' : ''}`,
      text: String(page),
      attrs: {
        type: 'button',
        'aria-label': `Page ${page}`,
        'aria-current': page === pagination.page ? 'page' : false
      }
    });
    button.addEventListener('click', () => onPage(page));
    nav.append(button);
  }

  const next = el('button', {
    className: 'pagination-step',
    text: 'Next',
    attrs: { type: 'button', disabled: pagination.page >= pagination.totalPages }
  });
  next.addEventListener('click', () => onPage(pagination.page + 1));
  nav.append(next);
  container.append(nav);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export function formatRelativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units = [
    [60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week']
  ];
  if (seconds < 45) return 'just now';
  for (const [limit, unit] of units) {
    if (seconds < limit) {
      const divisor = unit === 'second' ? 1 : { minute: 60, hour: 3600, day: 86400, week: 604800 }[unit];
      return `${Math.round(seconds / divisor)} ${unit}${Math.round(seconds / divisor) === 1 ? '' : 's'} ago`;
    }
  }
  return formatDate(value);
}

export function formatSalaryRange(job) {
  if (job?.salaryMin === null || job?.salaryMin === undefined) return 'Salary not disclosed';
  const period = job.salaryPeriod === 'YEARLY' ? 'per year' : 'per month';
  const format = (amount) => Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${job.salaryCurrency} ${format(job.salaryMin)} – ${format(job.salaryMax)} ${period}`;
}

export function humanizeEnum(value) {
  if (typeof value !== 'string' || !value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Keeps Tab inside an open dialog and restores focus when it closes.
export function trapFocus(container, { onEscape } = {}) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const previousFocus = document.activeElement;

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...container.querySelectorAll(selector)].filter((node) => node.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', handleKeydown);
  return () => {
    container.removeEventListener('keydown', handleKeydown);
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  };
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// Counts up to a real, already-loaded number. With reduced motion, or without
// a number to show, it prints the value immediately instead.
export function animateCount(node, value) {
  const target = Number(value);
  if (!node || !Number.isFinite(target)) return;
  if (prefersReducedMotion() || target <= 0) {
    node.textContent = Number.isFinite(target) ? target.toLocaleString() : '—';
    return;
  }

  const durationMs = 900;
  const start = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    const eased = 1 - (1 - progress) ** 3;
    node.textContent = Math.round(target * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
