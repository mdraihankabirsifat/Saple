import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import { el, formatDateTime, showToast } from './ui.js';

// Saple Premium page.
//
// Prices, discounts and access are always the server's answer. This page only
// shows them: the quote is recalculated at checkout, and Premium is granted
// only after the payment gateway's own validation, never by anything here.
// The Premium tools themselves are not embedded here: the Saple Guide switches
// to Premium automatically, and the resume generator has its own page.

const state = {
  signedIn: isAuthenticated(),
  plans: [],
  payments: { paymentsEnabled: false, sandbox: null },
  access: null,
  selectedPlan: null,
  quote: null
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
  shortcuts: document.getElementById('premium-shortcuts'),
  openGuide: document.getElementById('open-guide')
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
        el('li', { text: 'Advanced Saple Guide and PDF resume export' }),
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

// ---- Shortcuts for active members --------------------------------------------

// Premium works where the features live; this page only links to them.
function renderShortcuts() {
  nodes.shortcuts.hidden = !(state.signedIn && state.access?.hasPremium);
}

nodes.openGuide?.addEventListener('click', async () => {
  const assistant = await import('./assistant.js');
  assistant.openSharedView('guide');
});

// ---- Start -------------------------------------------------------------------

function renderAll() {
  renderStatus();
  renderTrial();
  renderPlans();
  renderShortcuts();
}

async function init() {
  await Promise.all([loadPlans(), loadStatus()]);
  renderAll();
}

init();
