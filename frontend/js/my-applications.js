import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import {
  el, clear, renderSkeletons, renderEmptyState, renderErrorState,
  renderPagination, formatDate, formatDateTime, humanizeEnum, showToast
} from './ui.js';

const results = document.querySelector('#application-results');
const statusMessage = document.querySelector('#application-status');
const paginationHost = document.querySelector('#application-pagination');
const filterSelect = document.querySelector('#application-filter');

let currentPage = 1;

// Status is shown as a word and a shape, never as colour alone.
const STATUS_TONE = {
  SUBMITTED: 'neutral',
  UNDER_REVIEW: 'progress',
  SHORTLISTED: 'positive',
  ACCEPTED: 'positive',
  REJECTED: 'negative',
  WITHDRAWN: 'neutral'
};

function statusBadge(status) {
  return el('span', {
    className: `status-badge status-${STATUS_TONE[status] || 'neutral'}`,
    text: humanizeEnum(status),
    dataset: { status }
  });
}

function historyList(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return el('ol', { className: 'application-history' }, history.map((entry) => el('li', {}, [
    el('span', {
      className: 'application-history-status',
      text: entry.previousStatus
        ? `${humanizeEnum(entry.previousStatus)} → ${humanizeEnum(entry.newStatus)}`
        : humanizeEnum(entry.newStatus)
    }),
    el('time', { className: 'application-history-time', text: formatDateTime(entry.actionAt), attrs: { datetime: entry.actionAt } }),
    entry.actionNote ? el('p', { className: 'application-history-note', text: entry.actionNote }) : null
  ])));
}

async function withdraw(application, card) {
  const confirmed = window.confirm(
    `Withdraw your application for "${application.jobTitle}" at ${application.companyName}? This cannot be undone.`
  );
  if (!confirmed) return;

  const button = card.querySelector('[data-withdraw]');
  button.disabled = true;
  button.textContent = 'Withdrawing…';

  try {
    await apiRequest(`/api/me/applications/${application.applicationId}/withdraw`, {
      method: 'PATCH',
      auth: true
    });
    showToast('Application withdrawn.', 'success');
    load(currentPage);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Withdraw application';
    showToast(error.message, 'error');
  }
}

function applicationCard(application) {
  const details = el('details', { className: 'application-details' }, [
    el('summary', { text: 'Your statement and decision history' }),
    el('p', { className: 'application-cover-letter', text: application.coverLetter }),
    el('p', { className: 'application-history-loading', text: 'Loading history…' })
  ]);

  // History is only fetched when the reader opens the panel.
  details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.loaded === 'true') return;
    details.dataset.loaded = 'true';
    try {
      const full = await apiRequest(`/api/me/applications/${application.applicationId}`, { auth: true });
      details.querySelector('.application-history-loading')?.remove();
      const list = historyList(full.history);
      if (list) details.append(list);
    } catch (error) {
      const notice = details.querySelector('.application-history-loading');
      if (notice) notice.textContent = 'The decision history could not be loaded.';
      details.dataset.loaded = 'false';
    }
  });

  const card = el('article', {
    className: 'application-card card',
    dataset: { applicationId: application.applicationId }
  }, [
    el('div', { className: 'application-head' }, [
      el('div', {}, [
        el('h2', { className: 'application-title' }, [
          el('a', {
            text: application.jobTitle,
            attrs: { href: `job-details.html?id=${encodeURIComponent(application.jobId)}` }
          })
        ]),
        el('p', { className: 'application-company', text: `${application.companyName} · ${application.location}` })
      ]),
      statusBadge(application.applicationStatus)
    ]),
    el('dl', { className: 'application-facts' }, [
      el('div', {}, [el('dt', { text: 'Applied' }), el('dd', { text: formatDate(application.submittedAt) })]),
      el('div', {}, [el('dt', { text: 'Last update' }), el('dd', { text: formatDate(application.updatedAt) })]),
      el('div', {}, [el('dt', { text: 'Vacancy' }), el('dd', { text: humanizeEnum(application.jobStatus) })])
    ]),
    details
  ]);

  if (application.canWithdraw) {
    const withdrawButton = el('button', {
      className: 'button button-secondary button-small',
      text: 'Withdraw application',
      attrs: { type: 'button' },
      dataset: { withdraw: '' }
    });
    withdrawButton.addEventListener('click', () => withdraw(application, card));
    card.append(withdrawButton);
  }

  return card;
}

function requireSignIn() {
  statusMessage.textContent = 'Sign in to see your applications.';
  renderEmptyState(results, {
    title: 'Sign in to track your applications',
    message: 'Your applications are private to your account. Sign in to see their status and history.',
    actionLabel: 'Go to sign in',
    onAction: () => window.location.assign('login.html?returnTo=my-applications.html')
  });
}

async function load(page = 1) {
  if (!isAuthenticated()) {
    requireSignIn();
    return;
  }

  currentPage = page;
  statusMessage.textContent = 'Loading your applications…';
  renderSkeletons(results, 3, 'row');
  clear(paginationHost);

  const filter = filterSelect?.value ? `&status=${encodeURIComponent(filterSelect.value)}` : '';

  try {
    const data = await apiRequest(`/api/me/applications?page=${page}${filter}`, { auth: true });
    results.removeAttribute('aria-busy');

    const visible = filterSelect?.value
      ? data.items.filter((item) => item.applicationStatus === filterSelect.value)
      : data.items;

    if (!visible.length) {
      statusMessage.textContent = 'No applications to show.';
      renderEmptyState(results, {
        title: 'No applications yet',
        message: 'When you apply to a vacancy on the Jobs page, it appears here with its current status.',
        actionLabel: 'Browse jobs',
        onAction: () => window.location.assign('jobs.html')
      });
      return;
    }

    statusMessage.textContent = `${data.pagination.total} application${data.pagination.total === 1 ? '' : 's'} in total.`;
    results.replaceChildren(...visible.map(applicationCard));
    renderPagination(paginationHost, data.pagination, load);
  } catch (error) {
    if (error.kind === 'AUTH') {
      requireSignIn();
      return;
    }
    statusMessage.textContent = 'Your applications could not be loaded.';
    renderErrorState(results, error, () => load(page));
  }
}

filterSelect?.addEventListener('change', () => load(1));
load(1);
