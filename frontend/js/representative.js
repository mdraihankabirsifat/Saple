import { apiRequest } from './api.js';
import { requireSession } from './require-session.js';
import {
  el, clear, renderSkeletons, renderEmptyState, renderErrorState, renderPagination,
  formatDate, formatDateTime, formatSalaryRange, humanizeEnum, showToast, trapFocus
} from './ui.js';

const gate = document.querySelector('#representative-gate');
const workspace = document.querySelector('#representative-workspace');
const scopeList = document.querySelector('#representative-scopes');
const tabList = document.querySelector('#representative-tabs');
const panels = {
  verifications: document.querySelector('#panel-verifications'),
  jobs: document.querySelector('#panel-jobs'),
  applications: document.querySelector('#panel-applications')
};

let scopes = [];

// One company workspace can cover several assigned companies, so every write
// names the company explicitly rather than assuming a single scope.
function scopeOptions(select, { includeAll = false } = {}) {
  clear(select);
  if (includeAll) select.append(el('option', { text: 'All my companies', attrs: { value: '' } }));
  for (const scope of scopes) {
    select.append(el('option', { text: scope.companyName, attrs: { value: scope.companyId } }));
  }
}

function showGate(title, message, action) {
  workspace.hidden = true;
  gate.hidden = false;
  clear(gate);
  gate.append(el('div', { className: 'state-panel state-empty', attrs: { role: 'status' } }, [
    el('h1', { className: 'state-panel-title', text: title }),
    el('p', { className: 'state-panel-text', text: message }),
    action
  ]));
}

// ---------------------------------------------------------------------------
// Verification queue
// ---------------------------------------------------------------------------

function verificationCard(verification, reload) {
  const decisionNote = el('textarea', {
    className: 'input',
    attrs: {
      rows: '2', maxlength: '500',
      placeholder: 'Reason (required when rejecting)',
      'aria-label': `Decision reason for ${verification.employeeName}`
    }
  });

  const approve = el('button', { className: 'button button-primary button-small', text: 'Verify', attrs: { type: 'button' } });
  const reject = el('button', { className: 'button button-secondary button-small', text: 'Reject', attrs: { type: 'button' } });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });

  async function decide(status) {
    if (status === 'REJECTED' && !decisionNote.value.trim()) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'A reason is required when rejecting a verification request.';
      decisionNote.focus();
      return;
    }
    if (!window.confirm(
      `Record ${status === 'VERIFIED' ? 'verification' : 'rejection'} for ${verification.employeeName} at ${verification.companyName}?`
    )) return;

    approve.disabled = true;
    reject.disabled = true;
    try {
      await apiRequest(`/api/representative/verifications/${verification.verificationId}/status`, {
        method: 'PATCH',
        auth: true,
        body: { status, rejectionReason: decisionNote.value.trim() || undefined }
      });
      showToast('Verification decision recorded.', 'success');
      reload();
    } catch (error) {
      approve.disabled = false;
      reject.disabled = false;
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    }
  }

  approve.addEventListener('click', () => decide('VERIFIED'));
  reject.addEventListener('click', () => decide('REJECTED'));

  const isPending = verification.verificationStatus === 'PENDING';

  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: verification.employeeName }),
        el('p', { className: 'queue-subtitle', text: `${verification.roleName || 'Role not set'} · ${verification.companyName}` })
      ]),
      el('span', {
        className: `status-badge status-${isPending ? 'progress' : verification.verificationStatus === 'VERIFIED' ? 'positive' : 'negative'}`,
        text: humanizeEnum(verification.verificationStatus)
      })
    ]),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Employment' }), el('dd', { text: humanizeEnum(verification.employmentStatus) })]),
      el('div', {}, [el('dt', { text: 'Method' }), el('dd', { text: humanizeEnum(verification.verificationMethod) })]),
      el('div', {}, [
        el('dt', { text: verification.companyEmail ? 'Company email' : 'Proof reference' }),
        el('dd', { text: verification.companyEmail || verification.proofReference || '—' })
      ]),
      el('div', {}, [el('dt', { text: 'Requested' }), el('dd', { text: formatDate(verification.requestedAt) })])
    ]),
    el('p', {
      className: 'queue-privacy',
      text: 'This evidence is private to this company workspace. It is never shown publicly or to another company.'
    }),
    isPending ? decisionNote : null,
    isPending ? el('div', { className: 'queue-actions' }, [approve, reject]) : null,
    isPending ? feedback : null,
    !isPending && verification.rejectionReason
      ? el('p', { className: 'queue-note', text: `Reason recorded: ${verification.rejectionReason}` })
      : null
  ]);
}

async function loadVerifications(page = 1) {
  const panel = panels.verifications;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');
  const filter = panel.querySelector('[data-status-filter]');
  const company = panel.querySelector('[data-company-filter]');

  status.textContent = 'Loading verification requests…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  const params = new URLSearchParams({ page: String(page) });
  if (filter?.value) params.set('status', filter.value);
  if (company?.value) params.set('companyId', company.value);

  try {
    const data = await apiRequest(`/api/representative/verifications?${params}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No verification requests match this filter.';
      renderEmptyState(host, {
        title: 'Nothing waiting',
        message: 'Verification requests for your assigned companies appear here as employees submit them.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} request${data.pagination.total === 1 ? '' : 's'}.`;
    host.replaceChildren(...data.items.map((item) => verificationCard(item, () => loadVerifications(page))));
    renderPagination(paginationHost, data.pagination, loadVerifications);
  } catch (error) {
    status.textContent = 'Verification requests could not be loaded.';
    renderErrorState(host, error, () => loadVerifications(page));
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const JOB_TRANSITIONS = {
  DRAFT: [{ to: 'PUBLISHED', label: 'Publish' }],
  PUBLISHED: [{ to: 'CLOSED', label: 'Close' }],
  CLOSED: [{ to: 'ARCHIVED', label: 'Archive' }],
  ARCHIVED: []
};

async function changeJobStatus(job, nextStatus, reload) {
  const warning = nextStatus === 'CLOSED'
    ? ' Open applicants will be notified. Existing applications and history are kept.'
    : '';
  if (!window.confirm(`Move "${job.title}" to ${nextStatus}?${warning}`)) return;

  try {
    await apiRequest(`/api/representative/jobs/${job.jobId}/status`, {
      method: 'PATCH',
      auth: true,
      body: { jobStatus: nextStatus }
    });
    showToast(`Vacancy moved to ${nextStatus}.`, 'success');
    reload();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function jobRow(job, reload) {
  const actions = el('div', { className: 'queue-actions' });
  for (const transition of JOB_TRANSITIONS[job.jobStatus] || []) {
    const button = el('button', {
      className: 'button button-secondary button-small',
      text: transition.label,
      attrs: { type: 'button' }
    });
    button.addEventListener('click', () => changeJobStatus(job, transition.to, reload));
    actions.append(button);
  }

  const viewApplications = el('button', {
    className: 'button button-secondary button-small',
    text: `Applications (${job.applicationCount})`,
    attrs: { type: 'button' }
  });
  viewApplications.addEventListener('click', () => {
    selectTab('applications');
    const jobFilter = panels.applications.querySelector('[data-job-filter]');
    if (jobFilter) jobFilter.value = String(job.jobId);
    loadApplications(1);
  });
  actions.append(viewApplications);

  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: job.title }),
        el('p', { className: 'queue-subtitle', text: `${job.companyName} · ${job.location}` })
      ]),
      el('span', {
        className: `status-badge status-${job.jobStatus === 'PUBLISHED' ? 'positive' : job.jobStatus === 'DRAFT' ? 'neutral' : 'progress'}`,
        text: humanizeEnum(job.jobStatus)
      })
    ]),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Salary' }), el('dd', { text: formatSalaryRange(job) })]),
      el('div', {}, [el('dt', { text: 'Deadline' }), el('dd', { text: formatDate(job.applicationDeadline) })]),
      el('div', {}, [el('dt', { text: 'Applications' }), el('dd', { text: String(job.applicationCount) })]),
      el('div', {}, [el('dt', { text: 'Updated' }), el('dd', { text: formatDate(job.updatedAt) })])
    ]),
    actions
  ]);
}

async function loadJobs(page = 1) {
  const panel = panels.jobs;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');
  const filter = panel.querySelector('[data-status-filter]');
  const company = panel.querySelector('[data-company-filter]');

  status.textContent = 'Loading your company vacancies…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  const params = new URLSearchParams({ page: String(page) });
  if (filter?.value) params.set('status', filter.value);
  if (company?.value) params.set('companyId', company.value);

  try {
    const data = await apiRequest(`/api/representative/jobs?${params}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No vacancies match this filter.';
      renderEmptyState(host, {
        title: 'No vacancies yet',
        message: 'Create a vacancy to start receiving applications through Saple.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} vacanc${data.pagination.total === 1 ? 'y' : 'ies'}.`;
    host.replaceChildren(...data.items.map((job) => jobRow(job, () => loadJobs(page))));
    renderPagination(paginationHost, data.pagination, loadJobs);
  } catch (error) {
    status.textContent = 'Vacancies could not be loaded.';
    renderErrorState(host, error, () => loadJobs(page));
  }
}

// ---------------------------------------------------------------------------
// Create-vacancy dialog
// ---------------------------------------------------------------------------

function field(labelText, control, hint) {
  const id = control.getAttribute('id');
  return el('div', { className: 'form-group' }, [
    el('label', { text: labelText, attrs: { for: id } }),
    control,
    hint ? el('p', { className: 'field-hint', text: hint }) : null
  ]);
}

function select(id, name, options) {
  const node = el('select', { className: 'input', attrs: { id, name } });
  for (const option of options) {
    node.append(el('option', { text: option.label, attrs: { value: option.value } }));
  }
  return node;
}

function openJobDialog(onCreated) {
  const companySelect = el('select', { className: 'input', attrs: { id: 'job-company', name: 'companyId', required: true } });
  scopeOptions(companySelect);

  const roleSelect = select('job-role', 'roleId', [{ value: '', label: 'Not categorised' }]);
  apiRequest('/api/job-roles')
    .then((roles) => {
      for (const role of roles) {
        roleSelect.append(el('option', { text: role.roleName, attrs: { value: role.roleId } }));
      }
    })
    .catch(() => {});

  const title = el('input', { className: 'input', attrs: { id: 'job-title', name: 'title', maxlength: '160', minlength: '4', required: true } });
  const location = el('input', { className: 'input', attrs: { id: 'job-location', name: 'location', maxlength: '120', required: true } });
  const description = el('textarea', { className: 'input', attrs: { id: 'job-description', name: 'description', rows: '5', minlength: '20', maxlength: '6000', required: true } });
  const requirements = el('textarea', { className: 'input', attrs: { id: 'job-requirements', name: 'requirements', rows: '3', maxlength: '4000' } });
  const employmentType = select('job-employment', 'employmentType', [
    { value: 'FULL_TIME', label: 'Full time' }, { value: 'PART_TIME', label: 'Part time' },
    { value: 'CONTRACT', label: 'Contract' }, { value: 'INTERN', label: 'Intern' }
  ]);
  const workMode = select('job-work-mode', 'workMode', [
    { value: 'ONSITE', label: 'Onsite' }, { value: 'HYBRID', label: 'Hybrid' }, { value: 'REMOTE', label: 'Remote' }
  ]);
  const salaryMin = el('input', { className: 'input', attrs: { id: 'job-salary-min', name: 'salaryMin', type: 'text', inputmode: 'decimal', maxlength: '13' } });
  const salaryMax = el('input', { className: 'input', attrs: { id: 'job-salary-max', name: 'salaryMax', type: 'text', inputmode: 'decimal', maxlength: '13' } });
  const salaryPeriod = select('job-salary-period', 'salaryPeriod', [
    { value: 'MONTHLY', label: 'Per month' }, { value: 'YEARLY', label: 'Per year' }
  ]);
  const deadline = el('input', { className: 'input', attrs: { id: 'job-deadline', name: 'applicationDeadline', type: 'date', required: true } });
  const jobStatus = select('job-initial-status', 'jobStatus', [
    { value: 'DRAFT', label: 'Save as draft' }, { value: 'PUBLISHED', label: 'Publish immediately' }
  ]);

  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
  const submit = el('button', { className: 'button button-primary', text: 'Create vacancy', attrs: { type: 'submit' } });
  const cancel = el('button', { className: 'button button-secondary', text: 'Cancel', attrs: { type: 'button' } });

  const form = el('form', { className: 'dialog-form' }, [
    field('Company', companySelect),
    field('Job title', title),
    field('Job role', roleSelect, 'Optional. Helps job seekers filter by category.'),
    field('Location', location),
    field('Description', description, 'At least 20 characters. Plain text only.'),
    field('Requirements', requirements, 'Optional.'),
    field('Employment type', employmentType),
    field('Work mode', workMode),
    field('Minimum salary', salaryMin, 'Leave both salary fields empty to publish without a range.'),
    field('Maximum salary', salaryMax),
    field('Salary period', salaryPeriod),
    field('Application deadline', deadline, 'Must be today or later.'),
    field('Publication', jobStatus),
    el('div', { className: 'dialog-actions' }, [submit, cancel]),
    feedback
  ]);

  const dialog = el('div', { className: 'dialog-backdrop', dataset: { dialog: '' } }, [
    el('div', { className: 'dialog card', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Create a vacancy', tabindex: '-1' } }, [
      el('h2', { className: 'dialog-heading', text: 'Create a vacancy' }),
      el('p', { className: 'dialog-intro', text: 'The vacancy is created for the selected company only. Drafts are never visible to the public.' }),
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
    submit.textContent = 'Creating…';
    feedback.className = 'form-feedback';
    feedback.textContent = '';

    const body = {
      roleId: roleSelect.value || undefined,
      title: title.value,
      description: description.value,
      requirements: requirements.value || undefined,
      location: location.value,
      employmentType: employmentType.value,
      workMode: workMode.value,
      applicationDeadline: deadline.value,
      jobStatus: jobStatus.value
    };
    if (salaryMin.value.trim() || salaryMax.value.trim()) {
      body.salaryMin = salaryMin.value.trim();
      body.salaryMax = salaryMax.value.trim();
      body.salaryPeriod = salaryPeriod.value;
      body.salaryCurrency = 'BDT';
    }

    try {
      await apiRequest(`/api/representative/companies/${companySelect.value}/jobs`, {
        method: 'POST', auth: true, body
      });
      showToast('Vacancy created.', 'success');
      close();
      onCreated();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = 'Create vacancy';
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    }
  });

  document.body.append(dialog);
  dialog.querySelector('.dialog').focus();
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

const APPLICATION_DECISIONS = [
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' }
];

function applicationCard(application, reload) {
  const decision = select(
    `decision-${application.applicationId}`,
    'applicationStatus',
    APPLICATION_DECISIONS
  );
  const note = el('textarea', {
    className: 'input',
    attrs: {
      rows: '2', maxlength: '1000',
      placeholder: 'Note (required when accepting or rejecting)',
      'aria-label': `Decision note for ${application.applicantName}`
    }
  });
  const save = el('button', { className: 'button button-primary button-small', text: 'Record decision', attrs: { type: 'button' } });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });

  save.addEventListener('click', async () => {
    if (['ACCEPTED', 'REJECTED'].includes(decision.value) && !note.value.trim()) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'A note is required when accepting or rejecting an application.';
      note.focus();
      return;
    }
    if (!window.confirm(`Move this application to ${decision.value}? The applicant is notified.`)) return;

    save.disabled = true;
    try {
      await apiRequest(`/api/representative/applications/${application.applicationId}/status`, {
        method: 'PATCH',
        auth: true,
        body: { applicationStatus: decision.value, note: note.value.trim() || undefined }
      });
      showToast('Application decision recorded.', 'success');
      reload();
    } catch (error) {
      save.disabled = false;
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    }
  });

  const isOpen = ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'].includes(application.applicationStatus);

  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: application.applicantName }),
        el('p', { className: 'queue-subtitle', text: `${application.jobTitle} · ${application.companyName}` })
      ]),
      el('span', {
        className: `status-badge status-${['ACCEPTED', 'SHORTLISTED'].includes(application.applicationStatus) ? 'positive' : application.applicationStatus === 'REJECTED' ? 'negative' : 'progress'}`,
        text: humanizeEnum(application.applicationStatus)
      })
    ]),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Applied' }), el('dd', { text: formatDateTime(application.submittedAt) })]),
      el('div', {}, [el('dt', { text: 'Contact' }), el('dd', { text: application.applicantEmail })])
    ]),
    el('details', { className: 'application-details' }, [
      el('summary', { text: 'Application statement' }),
      el('p', { className: 'application-cover-letter', text: application.coverLetter })
    ]),
    isOpen ? el('div', { className: 'decision-row' }, [decision, note, save]) : null,
    isOpen ? feedback : null
  ]);
}

async function loadApplications(page = 1) {
  const panel = panels.applications;
  const host = panel.querySelector('[data-queue]');
  const paginationHost = panel.querySelector('[data-pagination]');
  const status = panel.querySelector('[data-status]');
  const statusFilter = panel.querySelector('[data-status-filter]');
  const jobFilter = panel.querySelector('[data-job-filter]');

  status.textContent = 'Loading applications…';
  renderSkeletons(host, 2, 'row');
  clear(paginationHost);

  const params = new URLSearchParams({ page: String(page) });
  if (statusFilter?.value) params.set('status', statusFilter.value);
  if (jobFilter?.value) params.set('jobId', jobFilter.value);

  try {
    const data = await apiRequest(`/api/representative/applications?${params}`, { auth: true });
    host.removeAttribute('aria-busy');

    if (!data.items.length) {
      status.textContent = 'No applications match this filter.';
      renderEmptyState(host, {
        title: 'No applications yet',
        message: 'Applications to your company vacancies appear here as job seekers apply.'
      });
      return;
    }

    status.textContent = `${data.pagination.total} application${data.pagination.total === 1 ? '' : 's'}.`;
    host.replaceChildren(...data.items.map((item) => applicationCard(item, () => loadApplications(page))));
    renderPagination(paginationHost, data.pagination, loadApplications);
  } catch (error) {
    status.textContent = 'Applications could not be loaded.';
    renderErrorState(host, error, () => loadApplications(page));
  }
}

// ---------------------------------------------------------------------------
// Tabs and startup
// ---------------------------------------------------------------------------

const LOADERS = {
  verifications: loadVerifications,
  jobs: loadJobs,
  applications: loadApplications
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

function wireTabs() {
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
}

async function start() {
  // The server confirms the session before any workspace request is made.
  // An unauthenticated visitor is redirected; anyone else continues, and the
  // representative scope itself is decided by the backend below.
  const account = await requireSession({
    returnTo: 'representative.html',
    onError: (error) => showGate('The workspace could not be loaded', error.message,
      el('a', { className: 'button button-secondary', text: 'Back to Saple', attrs: { href: 'index.html' } }))
  });
  if (!account) return;

  try {
    const data = await apiRequest('/api/representative/workspace', { auth: true });
    scopes = Array.isArray(data.scopes) ? data.scopes : [];
  } catch (error) {
    if (error.kind === 'FORBIDDEN') {
      // The same message whether the account was never a representative or had
      // its last scope revoked: the server has already decided, and the reason
      // is not the browser's to guess.
      showGate(
        'No active company assignment',
        'This account does not currently have an active company representative assignment. An administrator approves and revokes these assignments.',
        el('a', { className: 'button button-secondary', text: 'Back to Saple', attrs: { href: 'index.html' } })
      );
      return;
    }
    if (error.kind === 'AUTH') {
      showGate(
        'Your session has ended',
        'Sign in again to open your company workspace.',
        el('a', { className: 'button button-primary', text: 'Sign in', attrs: { href: 'login.html?returnTo=representative.html' } })
      );
      return;
    }
    showGate('The workspace could not be loaded', error.message,
      el('button', { className: 'button button-primary', text: 'Retry', attrs: { type: 'button' } }));
    gate.querySelector('button')?.addEventListener('click', start);
    return;
  }

  gate.hidden = true;
  workspace.hidden = false;

  scopeList.replaceChildren(...scopes.map((scope) => el('li', { className: 'scope-chip' }, [
    el('strong', { text: scope.companyName }),
    el('span', { text: scope.jobTitle || 'Company representative' }),
    el('span', { className: 'scope-since', text: `Active since ${formatDate(scope.approvedAt)}` })
  ])));

  for (const panel of Object.values(panels)) {
    const companyFilter = panel.querySelector('[data-company-filter]');
    if (companyFilter) {
      scopeOptions(companyFilter, { includeAll: true });
      companyFilter.addEventListener('change', () => {
        const key = panel.id.replace('panel-', '');
        LOADERS[key](1);
      });
    }
    const statusFilter = panel.querySelector('[data-status-filter]');
    statusFilter?.addEventListener('change', () => LOADERS[panel.id.replace('panel-', '')](1));
    const jobFilter = panel.querySelector('[data-job-filter]');
    jobFilter?.addEventListener('change', () => loadApplications(1));
  }

  // The application job filter lists the caller's own vacancies only.
  apiRequest('/api/representative/jobs?pageSize=50', { auth: true })
    .then((data) => {
      const jobFilter = panels.applications.querySelector('[data-job-filter]');
      if (!jobFilter) return;
      for (const job of data.items) {
        jobFilter.append(el('option', { text: job.title, attrs: { value: job.jobId } }));
      }
    })
    .catch(() => {});

  document.querySelector('#create-job')?.addEventListener('click', () => {
    openJobDialog(() => loadJobs(1));
  });

  wireTabs();
  selectTab('verifications');
}

start();
