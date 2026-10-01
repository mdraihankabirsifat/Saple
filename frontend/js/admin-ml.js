import { apiRequest } from './api.js';

const status = document.querySelector('#ml-queue-status');
const list = document.querySelector('#ml-queue-list');
const refresh = document.querySelector('#refresh-ml-queue');

function text(value) { return value === null || value === undefined ? 'Not available' : String(value); }

async function decide(screeningId, decision, note) {
  if (decision === 'REJECTED' && !note.value.trim()) {
    note.setCustomValidity('A rejection note is required.'); note.reportValidity(); return;
  }
  note.setCustomValidity('');
  try {
    await apiRequest(`/api/admin/ml/screenings/${screeningId}/decision`, {
      method: 'PATCH', auth: true, body: { status: decision, note: note.value.trim() }
    });
    await load();
  } catch (error) { status.textContent = error.message; status.classList.add('error'); }
}

function render(items) {
  list.replaceChildren();
  if (!items.length) { status.textContent = 'No pending ML screenings.'; return; }
  status.textContent = `${items.length} screening${items.length === 1 ? '' : 's'} awaiting human review.`;
  items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'admin-item';
    const title = document.createElement('h3'); title.textContent = `${item.entityType} #${item.entityId}`;
    const details = document.createElement('p');
    details.textContent = `${item.publicationState} · ${item.screeningStatus} · risk ${text(item.riskProbability)} · ${text(item.reasonCodes?.join(', '))}`;
    const metadata = document.createElement('p'); metadata.textContent = `Model: ${text(item.modelKey)} ${text(item.modelVersion)} · submitted by ${text(item.submitterName)}`;
    const note = document.createElement('textarea'); note.maxLength = 1000; note.placeholder = 'Final decision note (required to reject)'; note.setAttribute('aria-label', `Decision note for screening ${item.screeningId}`);
    const actions = document.createElement('div'); actions.className = 'admin-item-actions';
    if (item.entityType === 'SALARY' || item.entityType === 'REVIEW' || item.entityType === 'INTERVIEW') {
      const hint = document.createElement('span'); hint.textContent = 'Use the submission moderation panel for the final decision.'; actions.append(hint);
      card.append(title, details, metadata, actions); list.append(card); return;
    }
    const approve = document.createElement('button'); approve.className = 'button button-primary button-small'; approve.type = 'button'; approve.textContent = 'Confirm'; approve.addEventListener('click', () => decide(item.screeningId, 'APPROVED', note));
    const reject = document.createElement('button'); reject.className = 'button button-danger button-small'; reject.type = 'button'; reject.textContent = 'Reject'; reject.addEventListener('click', () => decide(item.screeningId, 'REJECTED', note));
    actions.append(approve, reject); card.append(title, details, metadata, note, actions); list.append(card);
  });
}

async function load() {
  if (!status) return;
  refresh.disabled = true; status.textContent = 'Loading pending screenings…'; status.classList.remove('error');
  try { render(await apiRequest('/api/admin/ml/screenings/pending', { auth: true })); }
  catch (error) { status.textContent = error.message; status.classList.add('error'); }
  finally { refresh.disabled = false; }
}

refresh?.addEventListener('click', load);
load();
