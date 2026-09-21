import { apiRequest, fetchApi } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el, clear, formatDate, humanizeEnum, showToast } from './ui.js';

// Profile section: ask an administrator for a company representative scope.
// Submitting only ever creates a PENDING request. The account role changes
// only when an administrator approves it, and never through this form.

const section = document.querySelector('#representative-request');

const TONES = { ACTIVE: 'positive', PENDING: 'progress', REJECTED: 'negative', REVOKED: 'negative' };

function assignmentItem(assignment) {
  return el('li', { className: 'assignment-item' }, [
    el('div', { className: 'assignment-head' }, [
      el('strong', { text: assignment.companyName }),
      el('span', {
        className: `status-badge status-${TONES[assignment.assignmentStatus] || 'neutral'}`,
        text: humanizeEnum(assignment.assignmentStatus)
      })
    ]),
    el('span', {
      className: 'field-hint',
      text: `${assignment.jobTitle || 'Role not stated'} · requested ${formatDate(assignment.createdAt)}`
    }),
    assignment.decisionNote && assignment.assignmentStatus !== 'ACTIVE'
      ? el('span', { className: 'field-hint', text: `Administrator note: ${assignment.decisionNote}` })
      : null
  ]);
}

async function loadAssignments(list) {
  try {
    const assignments = await apiRequest('/api/me/representative-assignments', { auth: true });
    clear(list);
    if (!assignments.length) {
      list.append(el('li', { className: 'field-hint', text: 'You have not requested a company scope.' }));
      return assignments;
    }
    list.append(...assignments.map(assignmentItem));
    return assignments;
  } catch (error) {
    clear(list);
    list.append(el('li', { className: 'field-hint', text: 'Your requests could not be loaded right now.' }));
    return [];
  }
}

async function render() {
  if (!section || !isAuthenticated()) return;

  // Administrators oversee representatives and cannot hold a company scope.
  if (getStoredUser()?.accountRole === 'ADMIN') return;

  const list = el('ul', { className: 'assignment-list', attrs: { 'aria-live': 'polite' } });
  const company = el('select', { className: 'input', attrs: { id: 'rep-company', required: true } }, [
    el('option', { text: 'Select a company', attrs: { value: '' } })
  ]);
  const jobTitle = el('input', {
    className: 'input',
    attrs: { id: 'rep-job-title', maxlength: '120', placeholder: 'For example: HR Manager' }
  });
  const note = el('textarea', {
    className: 'input',
    attrs: {
      id: 'rep-note', rows: '4', minlength: '20', maxlength: '1000', required: true,
      placeholder: 'Explain your role at the company and how an administrator can confirm it.'
    }
  });
  const submit = el('button', { className: 'button button-primary', text: 'Send request', attrs: { type: 'submit' } });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });

  const form = el('form', { className: 'representative-request-form' }, [
    el('div', { className: 'form-group' }, [el('label', { text: 'Company', attrs: { for: 'rep-company' } }), company]),
    el('div', { className: 'form-group' }, [el('label', { text: 'Your job title (optional)', attrs: { for: 'rep-job-title' } }), jobTitle]),
    el('div', { className: 'form-group' }, [
      el('label', { text: 'Why you should represent this company', attrs: { for: 'rep-note' } }),
      note,
      el('p', { className: 'field-hint', text: 'At least 20 characters. Do not include passwords, ID numbers or documents.' })
    ]),
    el('div', { className: 'form-actions' }, [submit]),
    feedback
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    feedback.className = 'form-feedback';
    feedback.textContent = '';
    try {
      await apiRequest('/api/me/representative-assignments', {
        method: 'POST',
        auth: true,
        body: {
          companyId: company.value,
          jobTitle: jobTitle.value.trim() || undefined,
          requestNote: note.value
        }
      });
      form.reset();
      showToast('Request sent to the administrators.', 'success');
      feedback.textContent = 'Request sent. It stays PENDING until an administrator reviews it.';
      await loadAssignments(list);
    } catch (error) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  clear(section);
  section.append(
    el('h2', { text: 'Company representative access' }),
    el('p', {
      text: 'Representatives review employment verifications and manage vacancies for their assigned company only. An administrator approves every request; signing up alone never grants this access.'
    }),
    list,
    form
  );
  section.hidden = false;

  await loadAssignments(list);

  try {
    const companies = await fetchApi('/api/companies');
    for (const entry of Array.isArray(companies) ? companies : []) {
      company.append(el('option', { text: entry.companyName, attrs: { value: entry.companyId } }));
    }
  } catch (error) {
    feedback.className = 'form-feedback is-error';
    feedback.textContent = 'The company list could not be loaded. Try again later.';
    submit.disabled = true;
  }
}

render();
