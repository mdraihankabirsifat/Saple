import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import {
  el, clear, renderErrorState, formatDate, formatSalaryRange, humanizeEnum, showToast
} from './ui.js';
import { createCompanyLogo } from './company-logo.js';
import { mountRepresentativeContacts } from './representative-contacts.js';
import { premiumJobNote } from './premium-ui.js';

const container = document.querySelector('#job-detail');
const applyHost = document.querySelector('#job-apply');
const statusMessage = document.querySelector('#job-detail-status');

function readJobId() {
  const raw = new URLSearchParams(window.location.search).get('id');
  return /^\d{1,15}$/.test(String(raw || '')) ? raw : null;
}

function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => el('p', { text: block }));
}

function premiumTitleBadge(job) {
  return job.accessLevel === 'PREMIUM'
    ? el('span', { className: 'premium-badge job-premium-badge', text: 'Premium opportunity' })
    : null;
}

// A Premium vacancy for a visitor without Premium: the API sent only what the
// vacancy is, so that is all this shows.
function renderLockedJob(job) {
  clear(container);
  document.title = `${job.title} | Jobs | Saple`;
  container.append(
    el('div', { className: 'job-detail-head' }, [
      createCompanyLogo(job.companyName, null, document, job.logoUrl),
      el('div', {}, [
        el('p', { className: 'eyebrow', text: job.companyName }),
        el('h1', { className: 'job-detail-title' }, [job.title, ' ', premiumTitleBadge(job)]),
        el('p', { className: 'job-detail-location', text: `${job.location} · ${humanizeEnum(job.workMode)}` })
      ])
    ]),
    el('dl', { className: 'job-detail-facts' }, [
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Employment type' }), el('dd', { text: humanizeEnum(job.employmentType) })
      ]),
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Published' }), el('dd', { text: formatDate(job.publishedAt) })
      ])
    ]),
    premiumJobNote()
  );
}

function renderJob(job) {
  if (job.locked) {
    renderLockedJob(job);
    return;
  }
  clear(container);
  document.title = `${job.title} | Jobs | Saple`;

  container.append(
    el('div', { className: 'job-detail-head' }, [
      createCompanyLogo(job.companyName, null, document, job.logoUrl),
      el('div', {}, [
        el('p', { className: 'eyebrow', text: job.companyName }),
        el('h1', { className: 'job-detail-title' }, [job.title, ' ', premiumTitleBadge(job)]),
        el('p', { className: 'job-detail-location', text: `${job.location} · ${humanizeEnum(job.workMode)}` })
      ])
    ]),
    el('dl', { className: 'job-detail-facts' }, [
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Employment type' }), el('dd', { text: humanizeEnum(job.employmentType) })
      ]),
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Job role' }), el('dd', { text: job.roleName || 'Not categorised' })
      ]),
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Salary' }), el('dd', { text: formatSalaryRange(job) })
      ]),
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Apply by' }), el('dd', { text: formatDate(job.applicationDeadline) })
      ]),
      el('div', { className: 'job-fact' }, [
        el('dt', { text: 'Published' }), el('dd', { text: formatDate(job.publishedAt) })
      ])
    ]),
    el('section', { className: 'job-detail-section', attrs: { 'aria-labelledby': 'job-description-heading' } }, [
      el('h2', { className: 'job-detail-subheading', text: 'About this role', attrs: { id: 'job-description-heading' } }),
      ...paragraphs(job.description)
    ]),
    job.requirements
      ? el('section', { className: 'job-detail-section', attrs: { 'aria-labelledby': 'job-requirements-heading' } }, [
        el('h2', { className: 'job-detail-subheading', text: 'What the company is looking for', attrs: { id: 'job-requirements-heading' } }),
        ...paragraphs(job.requirements)
      ])
      : null,
    el('p', {
      className: 'job-detail-disclaimer',
      text: 'This vacancy was posted by an approved representative of this company inside Saple, an independent BUET CSE academic project. Saple is not the company’s official careers site and does not handle hiring on its behalf.'
    })
  );
  mountRepresentativeContacts(container, job.companyId);
}

function renderSignedOutApply(job) {
  clear(applyHost);
  applyHost.append(el('div', { className: 'apply-panel card' }, [
    el('h2', { className: 'apply-heading', text: 'Apply through Saple' }),
    el('p', { text: 'Sign in with a Saple job-seeker account to apply. Applications are visible only to you and to the approved representatives of this company.' }),
    el('div', { className: 'apply-actions' }, [
      el('a', { className: 'button button-primary', text: 'Sign in', attrs: { href: `login.html?returnTo=${encodeURIComponent(`job-details.html?id=${job.jobId}`)}` } }),
      el('a', { className: 'button button-secondary', text: 'Create account', attrs: { href: 'register.html' } })
    ])
  ]));
}

function renderRoleNotice(message) {
  clear(applyHost);
  applyHost.append(el('div', { className: 'apply-panel card' }, [
    el('h2', { className: 'apply-heading', text: 'Apply through Saple' }),
    el('p', { className: 'state-panel-hint', text: message })
  ]));
}

function renderPremiumRequired(job) {
  clear(applyHost);
  const signedIn = isAuthenticated();
  applyHost.append(el('div', { className: 'apply-panel card' }, [
    el('h2', { className: 'apply-heading', text: 'A Premium opportunity' }),
    el('p', { text: 'Applying to this vacancy is open to Saple Premium members, including during the free one-day trial.' }),
    el('div', { className: 'apply-actions' }, [
      el('a', { className: 'button button-primary', text: 'See Premium', attrs: { href: 'premium.html' } }),
      signedIn ? null : el('a', {
        className: 'button button-secondary',
        text: 'Sign in',
        attrs: { href: `login.html?returnTo=${encodeURIComponent(`job-details.html?id=${job.jobId}`)}` }
      })
    ])
  ]));
}

function renderApplied() {
  clear(applyHost);
  applyHost.append(el('div', { className: 'apply-panel card apply-complete' }, [
    el('h2', { className: 'apply-heading', text: 'Application submitted' }),
    el('p', { text: 'Your application is now SUBMITTED. You will be notified when its status changes.' }),
    el('a', { className: 'button button-secondary', text: 'Track your applications', attrs: { href: 'my-applications.html' } })
  ]));
}

function renderApplyForm(job) {
  clear(applyHost);

  const textarea = el('textarea', {
    className: 'input',
    attrs: {
      id: 'cover-letter', name: 'coverLetter', rows: '7',
      minlength: '30', maxlength: '4000', required: true,
      placeholder: 'Briefly explain why this role suits you, what you have worked on, and what you want to learn.'
    }
  });
  const counter = el('p', { className: 'field-hint', text: '0 / 4000 characters (minimum 30)' });
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.trim().length} / 4000 characters (minimum 30)`;
  });

  // Optional PDF resume. These checks only help the applicant; the server
  // checks size, type, name and the PDF signature again.
  const MAX_RESUME_BYTES = 2 * 1024 * 1024;
  const resumeInput = el('input', {
    className: 'input',
    attrs: { id: 'application-resume', name: 'resume', type: 'file', accept: 'application/pdf,.pdf' }
  });
  const resumeInfo = el('p', { className: 'field-hint', text: 'PDF only · Max 2 MB', attrs: { 'aria-live': 'polite' } });
  const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  function resumeProblem(file) {
    if (!file) return '';
    if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) return 'Please select a PDF resume.';
    if (file.size === 0) return 'The selected file is not a valid PDF.';
    if (file.size > MAX_RESUME_BYTES) return 'Resume must be 2 MB or smaller. Please upload a smaller PDF.';
    return '';
  }
  resumeInput.addEventListener('change', () => {
    const file = resumeInput.files?.[0];
    const problem = resumeProblem(file);
    resumeInput.setCustomValidity(problem);
    resumeInfo.classList.toggle('is-error', Boolean(problem));
    resumeInfo.textContent = problem || (file ? `${file.name} · ${formatSize(file.size)}` : 'PDF only · Max 2 MB');
  });

  const submit = el('button', { className: 'button button-primary', text: 'Submit application', attrs: { type: 'submit' } });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });

  const form = el('form', { className: 'apply-form' }, [
    el('div', { className: 'form-group' }, [
      el('label', { text: 'Your application statement', attrs: { for: 'cover-letter' } }),
      textarea,
      counter
    ]),
    el('div', { className: 'form-group' }, [
      el('label', { text: 'Resume / CV (PDF, optional)', attrs: { for: 'application-resume' } }),
      resumeInput,
      resumeInfo
    ]),
    el('p', {
      className: 'field-hint',
      text: 'Only the representatives of this company can open your resume. Do not upload a national ID, passport, passwords or other unrelated documents.'
    }),
    submit,
    feedback
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    feedback.className = 'form-feedback';
    const resumeFile = resumeInput.files?.[0] || null;
    const problem = resumeProblem(resumeFile);
    if (problem) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = problem;
      resumeInput.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Submitting…';

    // Multipart form data, so the browser sets the boundary itself.
    const body = new FormData();
    body.append('coverLetter', textarea.value);
    if (resumeFile) body.append('resume', resumeFile, resumeFile.name);

    try {
      await apiRequest(`/api/jobs/${encodeURIComponent(job.jobId)}/applications`, {
        method: 'POST',
        auth: true,
        body
      });
      showToast('Application submitted.', 'success');
      renderApplied();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = 'Submit application';
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.kind === 'CONFLICT'
        ? error.message
        : `${error.message} You can try again in a moment.`;
      if (error.kind === 'AUTH') renderSignedOutApply(job);
      if (error.code === 'PREMIUM_REQUIRED') renderPremiumRequired(job);
    }
  });

  applyHost.append(el('div', { className: 'apply-panel card' }, [
    el('h2', { className: 'apply-heading', text: 'Apply through Saple' }),
    el('p', { text: 'One application per vacancy. You can withdraw it later while a decision is still open.' }),
    form
  ]));
}

function renderApplySection(job) {
  if (job.locked) {
    const role = getStoredUser()?.accountRole;
    if (isAuthenticated() && role && role !== 'USER') {
      renderRoleNotice('Only job-seeker accounts apply to vacancies.');
      return;
    }
    renderPremiumRequired(job);
    return;
  }

  if (!isAuthenticated()) {
    renderSignedOutApply(job);
    return;
  }

  const user = getStoredUser();
  if (user?.accountRole === 'ADMIN') {
    renderRoleNotice('Administrator accounts oversee the platform and do not apply to vacancies.');
    return;
  }
  if (user?.accountRole === 'COMPANY_REPRESENTATIVE') {
    renderRoleNotice('Company representative accounts manage vacancies and cannot apply through the same account.');
    return;
  }

  renderApplyForm(job);
}

async function load() {
  const jobId = readJobId();

  if (!jobId) {
    statusMessage.textContent = 'No job was selected.';
    renderErrorState(container, { kind: 'NOT_FOUND', message: 'No job was selected.' }, () => {
      window.location.assign('jobs.html');
    });
    return;
  }

  statusMessage.textContent = 'Loading this job…';

  try {
    const job = await apiRequest(`/api/jobs/${encodeURIComponent(jobId)}`, { auth: 'optional' });
    statusMessage.textContent = '';
    renderJob(job);
    renderApplySection(job);
  } catch (error) {
    statusMessage.textContent = 'This job could not be loaded.';
    renderErrorState(container, error, load);
    clear(applyHost);
  }
}

load();
