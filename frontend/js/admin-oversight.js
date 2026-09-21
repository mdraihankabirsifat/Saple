import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import {
  el, clear, renderSkeletons, renderEmptyState, renderErrorState, renderPagination,
  formatDate, formatDateTime, humanizeEnum, showToast, trapFocus
} from './ui.js';

// Administrator oversight for company representatives, announcements and the
// platform-wide job board. It sits alongside the existing moderation queues in
// admin.js rather than replacing them, so that page stays readable.

const root = document.querySelector('#admin-oversight');
const tabList = document.querySelector('#oversight-tabs');
const panels = {
  representatives: document.querySelector('#panel-representatives'),
  announcements: document.querySelector('#panel-announcements'),
  jobs: document.querySelector('#panel-jobs-oversight')
};

if (root && tabList) startOversight();

// ---------------------------------------------------------------------------
// Representative assignments
// ---------------------------------------------------------------------------

function assignmentCard(assignment, reload) {
  const note = el('textarea', {
    className: 'input',
    attrs: {
      rows: '2', maxlength: '1000',
      placeholder: 'Reason (required to reject or revoke)',
      'aria-label': `Decision note for ${assignment.representativeName}`
    }
  });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
  const actions = el('div', { className: 'queue-actions' });

  async function decide(action, label) {
    if (action !== 'APPROVE' && !note.value.trim()) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'A reason is required to reject or revoke an assignment.';
      note.focus();
      return;
    }
    const warning = action === 'REVOKE'
      ? ' The representative loses access to this company immediately, including on any existing session.'
      : '';
    if (!window.confirm(
      `${label} ${assignment.representativeName} for ${assignment.companyName}?${warning}`
    )) return;

    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await apiRequest(`/api/admin/representative-assignments/${assignment.assignmentId}/decision`, {
        method: 'PATCH',
        auth: true,
        body: { action, note: note.value.trim() || undefined }
      });
      showToast('Representative decision recorded.', 'success');
      reload();
    } catch (error) {
      for (const button of actions.querySelectorAll('button')) button.disabled = false;
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    }
  }

  const available = {
    PENDING: [['APPROVE', 'Approve', 'button-primary'], ['REJECT', 'Reject', 'button-secondary']],
    ACTIVE: [['REVOKE', 'Revoke', 'button-secondary']],
    REJECTED: [],
    REVOKED: []
  }[assignment.assignmentStatus] || [];

  for (const [action, label, variant] of available) {
    const button = el('button', {
      className: `button ${variant} button-small`,
      text: label,
      attrs: { type: 'button' }
    });
    button.addEventListener('click', () => decide(action, label));
    actions.append(button);
  }

  const history = el('details', { className: 'application-details' }, [
    el('summary', { text: 'Assignment history' }),
    el('p', { className: 'application-history-loading', text: 'Loading history…' })
  ]);
  history.addEventListener('toggle', async () => {
    if (!history.open || history.dataset.loaded === 'true') return;
    history.dataset.loaded = 'true';
    try {
      const entries = await apiRequest(
        `/api/admin/representative-assignments/${assignment.assignmentId}/history`,
        { auth: true }
      );
      history.querySelector('.application-history-loading')?.remove();
      history.append(el('ol', { className: 'application-history' }, entries.map((entry) => el('li', {}, [
        el('span', {
          className: 'application-history-status',
          text: `${entry.actionType} → ${entry.newStatus}`
        }),
        el('time', {
          className: 'application-history-time',
          text: formatDateTime(entry.actionAt),
          attrs: { datetime: entry.actionAt }
        }),
        el('p', { className: 'application-history-note', text: `By ${entry.actorName}` }),
        entry.actionNote ? el('p', { className: 'application-history-note', text: entry.actionNote }) : null
      ]))));
    } catch (error) {
      const notice = history.querySelector('.application-history-loading');
      if (notice) notice.textContent = 'The assignment history could not be loaded.';
      history.dataset.loaded = 'false';
    }
  });

  const tone = {
    ACTIVE: 'positive', PENDING: 'progress', REJECTED: 'negative', REVOKED: 'negative'
  }[assignment.assignmentStatus] || 'neutral';

  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: assignment.representativeName }),
        el('p', { className: 'queue-subtitle', text: `${assignment.companyName} · ${assignment.jobTitle || 'Role not stated'}` })
      ]),
      el('span', { className: `status-badge status-${tone}`, text: humanizeEnum(assignment.assignmentStatus) })
    ]),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Account' }), el('dd', { text: assignment.representativeEmail })]),
      el('div', {}, [el('dt', { text: 'Account status' }), el('dd', { text: humanizeEnum(assignment.accountStatus) })]),
      el('div', {}, [el('dt', { text: 'Requested' }), el('dd', { text: formatDate(assignment.createdAt) })]),
      el('div', {}, [el('dt', { text: 'Approved' }), el('dd', { text: assignment.approvedAt ? formatDate(assignment.approvedAt) : '—' })])
    ]),
    assignment.requestNote
      ? el('p', { className: 'queue-note', text: `Request: ${assignment.requestNote}` })
      : null,
    assignment.decisionNote
      ? el('p', { className: 'queue-note', text: `Decision: ${assignment.decisionNote}` })
      : null,
    history,
    available.length ? note : null,
    available.length ? actions : null,
    available.length ? feedback : null
  ]);
}

async function loadAssignments(page = 1) {
  const panel = panels.representatives;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');
  const statusFilter = panel.querySelector('[data-status-filter]');
  const search = panel.querySelector('[data-search]');

  status.textContent = 'Loading representative assignments…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  const params = new URLSearchParams({ page: String(page) });
  if (statusFilter?.value) params.set('status', statusFilter.value);
  if (search?.value.trim()) params.set('search', search.value.trim());

  try {
    const data = await apiRequest(`/api/admin/representative-assignments?${params}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No assignments match this filter.';
      renderEmptyState(host, {
        title: 'No representative assignments',
        message: 'Accounts request a company scope from their profile; approved requests appear here.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} assignment${data.pagination.total === 1 ? '' : 's'}.`;
    host.replaceChildren(...data.items.map((item) => assignmentCard(item, () => loadAssignments(page))));
    renderPagination(paginationHost, data.pagination, loadAssignments);
  } catch (error) {
    status.textContent = 'Representative assignments could not be loaded.';
    renderErrorState(host, error, () => loadAssignments(page));
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

function announcementDialog(existing, onSaved) {
  const title = el('input', {
    className: 'input',
    attrs: { id: 'announcement-title', maxlength: '160', minlength: '4', required: true }
  });
  const message = el('textarea', {
    className: 'input',
    attrs: { id: 'announcement-message', rows: '4', maxlength: '600', minlength: '10', required: true }
  });
  const severity = el('select', { className: 'input', attrs: { id: 'announcement-severity' } });
  for (const [value, label] of [['INFO', 'Information'], ['WARNING', 'Important'], ['CRITICAL', 'Urgent']]) {
    severity.append(el('option', { text: label, attrs: { value } }));
  }
  const startsAt = el('input', { className: 'input', attrs: { id: 'announcement-starts', type: 'datetime-local' } });
  const endsAt = el('input', { className: 'input', attrs: { id: 'announcement-ends', type: 'datetime-local' } });
  const dismissible = el('select', { className: 'input', attrs: { id: 'announcement-dismissible' } });
  dismissible.append(
    el('option', { text: 'Readers may dismiss it', attrs: { value: 'true' } }),
    el('option', { text: 'Always shown', attrs: { value: 'false' } })
  );
  const active = el('select', { className: 'input', attrs: { id: 'announcement-active' } });
  active.append(
    el('option', { text: 'Active', attrs: { value: 'true' } }),
    el('option', { text: 'Hidden', attrs: { value: 'false' } })
  );

  if (existing) {
    title.value = existing.title;
    message.value = existing.message;
    severity.value = existing.severity;
    dismissible.value = String(existing.isDismissible);
    active.value = String(existing.isActive);
  }

  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
  const submit = el('button', {
    className: 'button button-primary',
    text: existing ? 'Save announcement' : 'Publish announcement',
    attrs: { type: 'submit' }
  });
  const cancel = el('button', { className: 'button button-secondary', text: 'Cancel', attrs: { type: 'button' } });

  function field(labelText, control, hint) {
    return el('div', { className: 'form-group' }, [
      el('label', { text: labelText, attrs: { for: control.getAttribute('id') } }),
      control,
      hint ? el('p', { className: 'field-hint', text: hint }) : null
    ]);
  }

  const form = el('form', { className: 'dialog-form' }, [
    field('Title', title),
    field('Message', message, 'Plain text only. Angle brackets are rejected by the API and the database.'),
    field('Severity', severity),
    field('Dismissible', dismissible),
    field('Visibility', active),
    field('Starts at', startsAt, 'Leave empty to start immediately.'),
    field('Ends at', endsAt, 'Leave empty to run until it is hidden.'),
    el('div', { className: 'dialog-actions' }, [submit, cancel]),
    feedback
  ]);

  const dialog = el('div', { className: 'dialog-backdrop' }, [
    el('div', {
      className: 'dialog card',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': existing ? 'Edit announcement' : 'New announcement', tabindex: '-1' }
    }, [
      el('h2', { className: 'dialog-heading', text: existing ? 'Edit announcement' : 'New announcement' }),
      el('p', {
        className: 'dialog-intro',
        text: 'Announcements appear as a bar under the navigation for every visitor while they are inside their schedule.'
      }),
      form
    ])
  ]);

  const release = trapFocus(dialog, { onEscape: close });
  function close() {
    release();
    dialog.remove();
  }
  cancel.addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const body = {
      title: title.value,
      message: message.value,
      severity: severity.value,
      isDismissible: dismissible.value === 'true',
      isActive: active.value === 'true',
      startsAt: startsAt.value || undefined,
      endsAt: endsAt.value || undefined
    };

    try {
      if (existing) {
        await apiRequest(`/api/admin/announcements/${existing.announcementId}`, {
          method: 'PUT', auth: true, body
        });
      } else {
        await apiRequest('/api/admin/announcements', { method: 'POST', auth: true, body });
      }
      showToast('Announcement saved.', 'success');
      close();
      onSaved();
    } catch (error) {
      submit.disabled = false;
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    }
  });

  document.body.append(dialog);
  dialog.querySelector('.dialog').focus();
}

function announcementCard(announcement, reload) {
  const toggle = el('button', {
    className: 'button button-secondary button-small',
    text: announcement.isActive ? 'Hide' : 'Show',
    attrs: { type: 'button' }
  });
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await apiRequest(`/api/admin/announcements/${announcement.announcementId}/active`, {
        method: 'PATCH', auth: true, body: { isActive: !announcement.isActive }
      });
      showToast('Announcement visibility updated.', 'success');
      reload();
    } catch (error) {
      toggle.disabled = false;
      showToast(error.message, 'error');
    }
  });

  const edit = el('button', {
    className: 'button button-secondary button-small',
    text: 'Edit',
    attrs: { type: 'button' }
  });
  edit.addEventListener('click', () => announcementDialog(announcement, reload));

  const now = Date.now();
  const live = announcement.isActive
    && new Date(announcement.startsAt).getTime() <= now
    && (!announcement.endsAt || new Date(announcement.endsAt).getTime() > now);

  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: announcement.title }),
        el('p', { className: 'queue-subtitle', text: humanizeEnum(announcement.severity) })
      ]),
      el('span', {
        className: `status-badge status-${live ? 'positive' : 'neutral'}`,
        text: live ? 'Showing now' : 'Not showing'
      })
    ]),
    el('p', { className: 'queue-note', text: announcement.message }),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Starts' }), el('dd', { text: formatDateTime(announcement.startsAt) })]),
      el('div', {}, [el('dt', { text: 'Ends' }), el('dd', { text: announcement.endsAt ? formatDateTime(announcement.endsAt) : 'No end date' })]),
      el('div', {}, [el('dt', { text: 'Dismissible' }), el('dd', { text: announcement.isDismissible ? 'Yes' : 'No' })])
    ]),
    el('div', { className: 'queue-actions' }, [edit, toggle])
  ]);
}

async function loadAnnouncements(page = 1) {
  const panel = panels.announcements;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');

  status.textContent = 'Loading announcements…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  try {
    const data = await apiRequest(`/api/admin/announcements?page=${page}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No announcements yet.';
      renderEmptyState(host, {
        title: 'No announcements',
        message: 'Publish an announcement to show a short notice under the navigation on every page.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} announcement${data.pagination.total === 1 ? '' : 's'}.`;
    host.replaceChildren(...data.items.map((item) => announcementCard(item, () => loadAnnouncements(page))));
    renderPagination(paginationHost, data.pagination, loadAnnouncements);
  } catch (error) {
    status.textContent = 'Announcements could not be loaded.';
    renderErrorState(host, error, () => loadAnnouncements(page));
  }
}

// ---------------------------------------------------------------------------
// Jobs oversight
// ---------------------------------------------------------------------------

async function loadJobsOversight(page = 1) {
  const panel = panels.jobs;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');
  const statusFilter = panel.querySelector('[data-status-filter]');
  const search = panel.querySelector('[data-search]');

  status.textContent = 'Loading job postings…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  const params = new URLSearchParams({ page: String(page) });
  if (statusFilter?.value) params.set('status', statusFilter.value);
  if (search?.value.trim()) params.set('search', search.value.trim());

  try {
    const data = await apiRequest(`/api/admin/jobs?${params}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No job postings match this filter.';
      renderEmptyState(host, {
        title: 'No job postings',
        message: 'Company representatives create vacancies from their own workspace.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} posting${data.pagination.total === 1 ? '' : 's'} across all companies.`;
    host.replaceChildren(...data.items.map((job) => {
      const actions = el('div', { className: 'queue-actions' });
      // Oversight power: an administrator can close a vacancy for safety
      // reasons without touching its applications or their history.
      if (job.jobStatus === 'PUBLISHED') {
        const close = el('button', {
          className: 'button button-secondary button-small',
          text: 'Close for safety',
          attrs: { type: 'button' }
        });
        close.addEventListener('click', async () => {
          if (!window.confirm(
            `Close "${job.title}" at ${job.companyName}? Applicants are notified and every application is kept.`
          )) return;
          close.disabled = true;
          try {
            await apiRequest(`/api/admin/jobs/${job.jobId}/status`, {
              method: 'PATCH', auth: true, body: { jobStatus: 'CLOSED' }
            });
            showToast('Vacancy closed.', 'success');
            loadJobsOversight(page);
          } catch (error) {
            close.disabled = false;
            showToast(error.message, 'error');
          }
        });
        actions.append(close);
      }

      return el('article', { className: 'queue-card card' }, [
        el('div', { className: 'queue-head' }, [
          el('div', {}, [
            el('h3', { className: 'queue-title', text: job.title }),
            el('p', { className: 'queue-subtitle', text: `${job.companyName} · posted by ${job.createdByName}` })
          ]),
          el('span', {
            className: `status-badge status-${job.jobStatus === 'PUBLISHED' ? 'positive' : job.jobStatus === 'DRAFT' ? 'neutral' : 'progress'}`,
            text: humanizeEnum(job.jobStatus)
          })
        ]),
        el('dl', { className: 'queue-facts' }, [
          el('div', {}, [el('dt', { text: 'Location' }), el('dd', { text: job.location })]),
          el('div', {}, [el('dt', { text: 'Deadline' }), el('dd', { text: formatDate(job.applicationDeadline) })]),
          el('div', {}, [el('dt', { text: 'Applications' }), el('dd', { text: String(job.applicationCount) })])
        ]),
        actions
      ]);
    }));
    renderPagination(paginationHost, data.pagination, loadJobsOversight);
  } catch (error) {
    status.textContent = 'Job postings could not be loaded.';
    renderErrorState(host, error, () => loadJobsOversight(page));
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const LOADERS = {
  representatives: loadAssignments,
  announcements: loadAnnouncements,
  jobs: loadJobsOversight
};
const loaded = new Set();

function selectTab(name) {
  for (const [key, panel] of Object.entries(panels)) {
    const isActive = key === name;
    panel.hidden = !isActive;
    const tab = tabList.querySelector(`[data-tab="${key}"]`);
    tab?.setAttribute('aria-selected', String(isActive));
    tab?.setAttribute('tabindex', isActive ? '0' : '-1');
  }
  if (!loaded.has(name)) {
    loaded.add(name);
    LOADERS[name](1);
  }
}

function startOversight() {
  if (!isAuthenticated()) return;

  tabList.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) selectTab(tab.dataset.tab);
  });

  tabList.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tabList.querySelectorAll('[data-tab]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    selectTab(tabs[next].dataset.tab);
  });

  for (const panel of Object.values(panels)) {
    const key = panel.id.replace('panel-', '').replace('-oversight', '');
    panel.querySelector('[data-status-filter]')?.addEventListener('change', () => LOADERS[key](1));
    const search = panel.querySelector('[data-search]');
    search?.addEventListener('change', () => LOADERS[key](1));
  }

  document.querySelector('#create-announcement')?.addEventListener('click', () => {
    announcementDialog(null, () => loadAnnouncements(1));
  });

  selectTab('representatives');
}
