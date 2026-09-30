import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import { el, clear, formatDateTime, showToast } from './ui.js';

// Saple Premium page.
//
// Prices, discounts and access are always the server's answer. This page only
// shows them: the quote is recalculated at checkout, and Premium is granted
// only after the payment gateway's own validation, never by anything here.

const MAX_CHAT_TURNS = 12;

const state = {
  signedIn: isAuthenticated(),
  plans: [],
  payments: { paymentsEnabled: false, sandbox: null },
  aiAvailable: false,
  access: null,
  selectedPlan: null,
  quote: null,
  chat: []
};

const nodes = {
  status: document.getElementById('premium-status'),
  trialAction: document.getElementById('trial-action'),
  trialDialog: document.getElementById('trial-dialog'),
  planGrid: document.getElementById('plan-grid'),
  planMessage: document.getElementById('plan-message'),
  checkout: document.getElementById('checkout-panel'),
  promoForm: document.getElementById('promo-form'),
  promoInput: document.getElementById('promo-code'),
  quoteLines: document.getElementById('quote-lines'),
  checkoutMessage: document.getElementById('checkout-message'),
  checkoutButton: document.getElementById('checkout-button'),
  checkoutCancel: document.getElementById('checkout-cancel'),
  sandboxNote: document.getElementById('sandbox-note'),
  tools: document.getElementById('premium-tools'),
  toolsMessage: document.getElementById('tools-message'),
  aiForm: document.getElementById('ai-form'),
  aiInput: document.getElementById('ai-input'),
  aiTranscript: document.getElementById('ai-transcript'),
  resumeForm: document.getElementById('resume-form'),
  resumeText: document.getElementById('resume-text'),
  resumeCount: document.getElementById('resume-count'),
  resumeRole: document.getElementById('resume-role'),
  resumeStyle: document.getElementById('resume-style'),
  resumeOutput: document.getElementById('resume-output'),
  resumePreview: document.getElementById('resume-preview'),
  resumeCopy: document.getElementById('resume-copy'),
  resumePrint: document.getElementById('resume-print')
};

function taka(value) {
  const amount = Number(value);
  return `৳${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function setMessage(node, text, tone = '') {
  node.textContent = text || '';
  node.classList.toggle('error', tone === 'error');
  node.classList.toggle('success', tone === 'success');
}

// ---- Status and trial ------------------------------------------------------

function renderStatus() {
  const access = state.access;
  if (!access) {
    nodes.status.hidden = true;
    return;
  }
  const lines = [];
  if (access.hasPremium) {
    lines.push(el('p', { className: 'premium-status-title' }, [
      el('span', { className: 'premium-badge', text: access.source === 'TRIAL' ? 'Premium trial' : 'Premium' }),
      access.source === 'TRIAL' ? ' Your free trial is active.' : ' Your Premium is active.'
    ]));
    lines.push(el('p', { text: `Access until ${formatDateTime(access.endsAt)}.` }));
  } else if (access.trialUsed) {
    lines.push(el('p', { className: 'premium-status-title', text: 'You are on the free plan.' }));
    lines.push(el('p', { text: 'Free trial already used.' }));
  } else {
    lines.push(el('p', { className: 'premium-status-title', text: 'You are on the free plan.' }));
  }
  nodes.status.replaceChildren(...lines);
  nodes.status.classList.toggle('is-active', Boolean(access.hasPremium));
  nodes.status.hidden = false;
}

function renderTrial() {
  const access = state.access;
  if (!state.signedIn || !access) return;

  if (access.hasPremium && access.source === 'TRIAL') {
    nodes.trialAction.replaceChildren(el('p', {
      className: 'premium-trial-state',
      text: `Trial active until ${formatDateTime(access.trialEndsAt)}.`
    }));
    return;
  }
  if (access.trialUsed) {
    nodes.trialAction.replaceChildren(el('p', { className: 'premium-trial-state', text: 'Free trial already used' }));
    return;
  }
  if (!access.trialEligible) {
    nodes.trialAction.replaceChildren(el('p', {
      className: 'premium-trial-state',
      text: access.hasPremium ? 'You already have Premium.' : 'The free trial is for accounts that have not had Premium before.'
    }));
    return;
  }

  const button = el('button', { className: 'button button-primary', text: 'Try Premium free for 1 day', attrs: { type: 'button' } });
  button.addEventListener('click', () => confirmTrial(button));
  nodes.trialAction.replaceChildren(button);
}

function confirmTrial(button) {
  const dialog = nodes.trialDialog;
  if (typeof dialog?.showModal !== 'function') {
    if (window.confirm('Your 24-hour trial starts immediately and cannot be restarted.')) startTrial(button);
    return;
  }
  dialog.returnValue = '';
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') startTrial(button);
  }, { once: true });
  dialog.showModal();
}

async function startTrial(button) {
  button.disabled = true;
  button.textContent = 'Starting…';
  try {
    state.access = await apiRequest('/api/premium/trial/start', { method: 'POST', auth: true });
    showToast(`Your Premium trial is active until ${formatDateTime(state.access.trialEndsAt)}.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
    await loadStatus();
  }
  renderAll();
}

async function loadStatus() {
  if (!state.signedIn) return;
  try {
    state.access = await apiRequest('/api/premium/status', { auth: true });
  } catch (error) {
    state.access = null;
    if (error.status === 401) state.signedIn = false;
  }
}

// ---- Plans and checkout ----------------------------------------------------

function renderPlans() {
  nodes.planGrid.querySelectorAll('.plan-card-paid').forEach((card) => card.remove());
  for (const plan of state.plans) {
    const action = state.signedIn
      ? el('button', { className: 'button button-primary', text: `Choose ${plan.name}`, attrs: { type: 'button' } })
      : el('a', { className: 'button button-primary', text: 'Sign in to buy', attrs: { href: 'login.html?returnTo=premium.html' } });
    if (state.signedIn) action.addEventListener('click', () => selectPlan(plan));

    nodes.planGrid.append(el('article', {
      className: `plan-card plan-card-paid${plan.savingBdt > 0 ? ' plan-card-featured' : ''}`,
      dataset: { planCode: plan.planCode }
    }, [
      plan.savingBdt > 0 ? el('p', { className: 'plan-saving', text: `Save ${taka(plan.savingBdt)}` }) : null,
      el('h3', { text: plan.name }),
      el('p', { className: 'plan-price' }, [el('span', { className: 'plan-amount', text: taka(plan.priceBdt) })]),
      el('p', { className: 'plan-meta', text: `${plan.durationDays} days` }),
      el('p', { className: 'plan-renewal', text: 'Prepaid · no automatic renewal' }),
      el('ul', { className: 'plan-points' }, [
        el('li', { text: 'Every Premium feature' }),
        el('li', { text: 'Advanced AI and resume generator' }),
        el('li', { text: 'Premium jobs and full interview questions' })
      ]),
      action
    ]));
  }
}

async function loadPlans() {
  try {
    const data = await apiRequest('/api/premium/plans');
    state.plans = data.plans || [];
    state.payments = data.payments || state.payments;
    state.aiAvailable = Boolean(data.premiumAiAvailable);
    setMessage(nodes.planMessage, state.plans.length ? '' : 'Premium plans are not available yet.');
  } catch (error) {
    setMessage(nodes.planMessage, `Plans could not be loaded. ${error.message}`, 'error');
  }
}

function renderQuote() {
  const quote = state.quote;
  const rows = [];
  if (quote) {
    rows.push([quote.planName, taka(quote.baseAmount)]);
    if (quote.discountAmount > 0) rows.push([`Code ${quote.promoCode}`, `-${taka(quote.discountAmount)}`]);
    rows.push(['Total', taka(quote.finalAmount)]);
  }
  nodes.quoteLines.replaceChildren(...rows.flatMap(([label, value], index) => {
    const total = index === rows.length - 1;
    return [
      el('dt', { className: total ? 'quote-total' : '', text: label }),
      el('dd', { className: total ? 'quote-total' : '', text: value })
    ];
  }));
}

async function requestQuote(promoCode = null) {
  return apiRequest('/api/premium/quote', {
    method: 'POST',
    auth: true,
    body: { planCode: state.selectedPlan.planCode, promoCode: promoCode || undefined }
  });
}

async function selectPlan(plan) {
  state.selectedPlan = plan;
  state.quote = null;
  nodes.promoInput.value = '';
  nodes.checkout.hidden = false;
  nodes.sandboxNote.hidden = state.payments.sandbox !== true;
  nodes.planGrid.querySelectorAll('.plan-card-paid').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.planCode === plan.planCode);
  });
  setMessage(nodes.checkoutMessage, 'Calculating price…');
  renderQuote();
  try {
    state.quote = await requestQuote();
    setMessage(nodes.checkoutMessage, state.payments.paymentsEnabled
      ? '' : 'Online payment is not available yet. Please check back soon.');
  } catch (error) {
    setMessage(nodes.checkoutMessage, error.message, 'error');
  }
  renderQuote();
  nodes.checkoutButton.disabled = !state.quote || !state.payments.paymentsEnabled;
  nodes.checkout.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

nodes.promoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedPlan) return;
  const code = nodes.promoInput.value.trim();
  const submit = nodes.promoForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    state.quote = await requestQuote(code || null);
    setMessage(nodes.checkoutMessage, code ? `Code ${state.quote.promoCode} applied.` : '', code ? 'success' : '');
  } catch (error) {
    // Keep the undiscounted price on screen; the code simply does not apply.
    setMessage(nodes.checkoutMessage, error.message, 'error');
    try { state.quote = await requestQuote(); } catch { state.quote = null; }
  } finally {
    submit.disabled = false;
  }
  renderQuote();
  nodes.checkoutButton.disabled = !state.quote || !state.payments.paymentsEnabled;
});

nodes.checkoutButton.addEventListener('click', async () => {
  if (!state.selectedPlan || !state.quote) return;
  nodes.checkoutButton.disabled = true;
  nodes.checkoutButton.textContent = 'Opening secure payment…';
  setMessage(nodes.checkoutMessage, '');
  try {
    const session = await apiRequest('/api/premium/checkout', {
      method: 'POST',
      auth: true,
      body: { planCode: state.selectedPlan.planCode, promoCode: state.quote.promoCode || undefined }
    });
    const target = new URL(session.redirectUrl);
    if (target.protocol !== 'https:') throw new Error('The payment page address was not secure.');
    window.location.assign(target.href);
  } catch (error) {
    setMessage(nodes.checkoutMessage, error.message, 'error');
    nodes.checkoutButton.disabled = false;
    nodes.checkoutButton.textContent = 'Continue to payment';
  }
});

nodes.checkoutCancel.addEventListener('click', () => {
  state.selectedPlan = null;
  state.quote = null;
  nodes.checkout.hidden = true;
  nodes.planGrid.querySelectorAll('.plan-card-paid').forEach((card) => card.classList.remove('is-selected'));
});

// ---- Premium tools ---------------------------------------------------------

function setToolsEnabled(enabled) {
  for (const form of [nodes.aiForm, nodes.resumeForm]) {
    form.querySelectorAll('textarea, input, select, button').forEach((control) => { control.disabled = !enabled; });
  }
}

function renderTools() {
  if (!state.signedIn || !state.access) {
    nodes.tools.hidden = true;
    return;
  }
  nodes.tools.hidden = false;
  if (!state.access.hasPremium) {
    setMessage(nodes.toolsMessage, 'These tools unlock with Premium or the free one-day trial.');
    setToolsEnabled(false);
  } else if (!state.aiAvailable) {
    setMessage(nodes.toolsMessage, 'Premium AI is temporarily unavailable. The free Saple Guide still works.');
    setToolsEnabled(false);
  } else {
    setMessage(nodes.toolsMessage, '');
    setToolsEnabled(true);
  }
}

function renderTranscript() {
  clear(nodes.aiTranscript);
  for (const turn of state.chat) {
    nodes.aiTranscript.append(el('div', { className: `ai-turn ai-turn-${turn.role}` }, [
      el('p', { className: 'ai-turn-label', text: turn.role === 'user' ? 'You' : 'Saple AI' }),
      ...String(turn.content).split(/\n{2,}/).map((paragraph) => el('p', { text: paragraph }))
    ]));
  }
  nodes.aiTranscript.scrollTop = nodes.aiTranscript.scrollHeight;
}

nodes.aiForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = nodes.aiInput.value.trim();
  if (!message) return;
  const submit = nodes.aiForm.querySelector('button[type="submit"]');
  state.chat.push({ role: 'user', content: message });
  nodes.aiInput.value = '';
  renderTranscript();
  submit.disabled = true;
  submit.textContent = 'Thinking…';
  try {
    const data = await apiRequest('/api/premium/ai/chat', {
      method: 'POST',
      auth: true,
      body: { messages: state.chat.slice(-MAX_CHAT_TURNS) }
    });
    state.chat.push({ role: 'assistant', content: data.answer || 'No answer this time. Please try again.' });
  } catch (error) {
    state.chat.pop();
    nodes.aiInput.value = message;
    showToast(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Ask';
  }
  renderTranscript();
});

nodes.resumeText.addEventListener('input', () => {
  nodes.resumeCount.textContent = nodes.resumeText.value.length.toLocaleString('en-US');
});

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

  nodes.resumePreview.replaceChildren(...[
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
  nodes.resumeOutput.hidden = false;
  nodes.resumeOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resumeAsText() {
  const lines = [];
  for (const node of nodes.resumePreview.querySelectorAll('h2, h3, p, li')) {
    if (node.tagName === 'H3') lines.push('', node.textContent.toUpperCase());
    else if (node.tagName === 'LI') lines.push(`• ${node.textContent}`);
    else lines.push(node.textContent);
  }
  return lines.join('\n').trim();
}

nodes.resumeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = nodes.resumeText.value.trim();
  if (text.length < 40) {
    showToast('Paste at least 40 characters about your experience, education and skills.', 'error');
    return;
  }
  const submit = nodes.resumeForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Generating…';
  try {
    const data = await apiRequest('/api/premium/resume/generate', {
      method: 'POST',
      auth: true,
      body: { text, targetRole: nodes.resumeRole.value.trim() || undefined, style: nodes.resumeStyle.value }
    });
    renderResume(data.resume);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Generate resume';
  }
});

nodes.resumeCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resumeAsText());
    showToast('Resume copied.', 'success');
  } catch {
    showToast('Copy is not available in this browser. Select the text instead.', 'error');
  }
});

nodes.resumePrint.addEventListener('click', () => {
  document.documentElement.classList.add('printing-resume');
  window.addEventListener('afterprint', () => document.documentElement.classList.remove('printing-resume'), { once: true });
  window.print();
});

// ---- Start -------------------------------------------------------------------

function renderAll() {
  renderStatus();
  renderTrial();
  renderPlans();
  renderTools();
}

async function init() {
  await Promise.all([loadPlans(), loadStatus()]);
  renderAll();
}

init();
