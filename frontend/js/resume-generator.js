import { API_BASE_URL, apiRequest } from './api.js';
import { getToken, isAuthenticated } from './auth.js';
import { el, showToast } from './ui.js';

// Resume Generator.
//
// Every signed-in member can generate, read and copy a resume. Saple's
// official PDF export is a Premium feature: the button is shown to everyone,
// locked for free accounts, and the server checks Premium again on download.
// The daily allowance is the server's; the number shown here is only a hint.

const nodes = {
  gate: document.getElementById('resume-gate'),
  workspace: document.getElementById('resume-workspace'),
  form: document.getElementById('resume-form'),
  text: document.getElementById('resume-text'),
  count: document.getElementById('resume-count'),
  role: document.getElementById('resume-role'),
  style: document.getElementById('resume-style'),
  quota: document.getElementById('resume-quota'),
  message: document.getElementById('resume-message'),
  output: document.getElementById('resume-output'),
  preview: document.getElementById('resume-preview'),
  copy: document.getElementById('resume-copy'),
  pdf: document.getElementById('resume-pdf'),
  upsell: document.getElementById('pdf-upsell')
};

const state = { resume: null, pdfAvailable: false, dailyLimit: null };

function setMessage(text, tone = '') {
  nodes.message.textContent = text || '';
  nodes.message.classList.toggle('error', tone === 'error');
}

function renderQuota(remaining, dailyLimit) {
  if (!Number.isInteger(remaining) || !Number.isInteger(dailyLimit)) return;
  nodes.quota.replaceChildren(
    el('strong', { text: `${remaining} of ${dailyLimit}` }),
    ' resume generations left today.'
  );
}

// Free accounts see the PDF button, locked, with the way to unlock it.
function renderPdfButton() {
  if (state.pdfAvailable) {
    nodes.pdf.replaceChildren('Download PDF');
    nodes.pdf.className = 'button button-primary button-small';
    nodes.pdf.removeAttribute('aria-disabled');
    nodes.upsell.hidden = true;
  } else {
    nodes.pdf.replaceChildren(
      el('span', { className: 'lock-icon', attrs: { 'aria-hidden': 'true' } }),
      'Download PDF'
    );
    nodes.pdf.className = 'button button-secondary button-small pdf-locked';
    nodes.pdf.setAttribute('aria-disabled', 'true');
    nodes.upsell.hidden = false;
  }
}

function dateRange(item) {
  return [item.start, item.end].filter(Boolean).join(' – ');
}

function resumeSection(title, children) {
  if (!children.length) return null;
  return el('section', { className: 'resume-section' }, [el('h3', { text: title }), ...children]);
}

function highlightList(items) {
  return items?.length ? el('ul', {}, items.map((item) => el('li', { text: item }))) : null;
}

function renderResume(resume) {
  const entries = (items, heading, sub) => items.map((item) => el('div', { className: 'resume-entry' }, [
    el('p', { className: 'resume-entry-title', text: heading(item) }),
    sub(item) ? el('p', { className: 'resume-entry-meta', text: sub(item) }) : null,
    item.details ? el('p', { text: item.details }) : null,
    item.description ? el('p', { text: item.description }) : null,
    highlightList(item.highlights)
  ]));

  nodes.preview.replaceChildren(...[
    resume.name ? el('h2', { className: 'resume-name', text: resume.name }) : null,
    resume.headline ? el('p', { className: 'resume-headline', text: resume.headline }) : null,
    resume.summary ? resumeSection('Summary', [el('p', { text: resume.summary })]) : null,
    resumeSection('Experience', entries(resume.experience || [],
      (item) => [item.title, item.organization].filter(Boolean).join(' · '),
      (item) => [item.location, dateRange(item)].filter(Boolean).join(' · '))),
    resumeSection('Education', entries(resume.education || [],
      (item) => [item.degree, item.field].filter(Boolean).join(', ') || item.institution,
      (item) => [item.degree || item.field ? item.institution : null, dateRange(item)].filter(Boolean).join(' · '))),
    resumeSection('Projects', entries(resume.projects || [], (item) => item.name, () => '')),
    resume.skills?.length ? resumeSection('Skills', [el('p', { text: resume.skills.join(' · ') })]) : null
  ].filter(Boolean));
  nodes.output.hidden = false;
  renderPdfButton();
  nodes.output.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resumeAsText() {
  const lines = [];
  for (const node of nodes.preview.querySelectorAll('h2, h3, p, li')) {
    if (node.tagName === 'H3') lines.push('', node.textContent.toUpperCase());
    else if (node.tagName === 'LI') lines.push(`• ${node.textContent}`);
    else lines.push(node.textContent);
  }
  return lines.join('\n').trim();
}

nodes.text.addEventListener('input', () => {
  nodes.count.textContent = nodes.text.value.length.toLocaleString('en-US');
});

nodes.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = nodes.text.value.trim();
  if (text.length < 40) {
    setMessage('Paste at least 40 characters about your experience, education and skills.', 'error');
    return;
  }
  const submit = nodes.form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Generating…';
  setMessage('');
  try {
    const data = await apiRequest('/api/resume/generate', {
      method: 'POST',
      auth: true,
      body: { text, targetRole: nodes.role.value.trim() || undefined, style: nodes.style.value }
    });
    state.resume = data.resume;
    state.pdfAvailable = data.pdfAvailable === true;
    renderResume(data.resume);
    renderQuota(data.remaining, state.dailyLimit);
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Generate resume';
  }
});

nodes.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resumeAsText());
    showToast('Resume copied.', 'success');
  } catch {
    showToast('Copy is not available in this browser. Select the text instead.', 'error');
  }
});

// The official PDF comes from the server, which checks Premium itself.
nodes.pdf.addEventListener('click', async () => {
  if (!state.pdfAvailable) {
    showToast('PDF download is available with Saple Premium.', 'error');
    return;
  }
  if (!state.resume) return;
  nodes.pdf.disabled = true;
  try {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/api/resume/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resume: state.resume })
    });
    if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
      const body = await response.json().catch(() => null);
      if (response.status === 403) {
        state.pdfAvailable = false;
        renderPdfButton();
      }
      throw new Error(body?.message || 'The PDF could not be created. Please try again.');
    }
    const fileName = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || 'Saple_Resume.pdf';
    const url = URL.createObjectURL(await response.blob());
    const link = el('a', { attrs: { href: url, download: fileName } });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    nodes.pdf.disabled = false;
  }
});

async function init() {
  if (!isAuthenticated()) {
    nodes.gate.hidden = false;
    return;
  }
  nodes.workspace.hidden = false;
  try {
    const status = await apiRequest('/api/resume/status', { auth: true });
    state.pdfAvailable = status.pdfAvailable === true;
    state.dailyLimit = status.dailyLimit;
    renderQuota(status.remaining, status.dailyLimit);
    if (!status.available) setMessage('The resume generator is temporarily unavailable. Please try again later.', 'error');
  } catch (error) {
    if (error.status === 401) {
      nodes.workspace.hidden = true;
      nodes.gate.hidden = false;
    }
  }
}

init();
