import { apiRequest } from './api.js';
import { isAuthenticated } from './auth.js';
import { el, formatDateTime } from './ui.js';

// Payment result page.
//
// The ?result= value in the address only chooses what to say first. Whether
// Premium was granted is read from the server, which records success only
// after validating the payment with SSLCommerz. Polling is bounded: after a
// short while the page says the payment is still being confirmed and stops.

const POLL_DELAYS_MS = [1500, 2000, 3000, 4000, 5000, 6000, 8000];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const params = new URLSearchParams(window.location.search);
const result = params.get('result');
const publicId = params.get('payment');

const root = document.getElementById('payment-result');
const title = document.getElementById('result-title');
const text = document.getElementById('result-text');
const details = document.getElementById('result-details');
const actions = document.getElementById('result-actions');

function taka(value) {
  const amount = Number(value);
  return `৳${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function show(state, heading, message) {
  root.dataset.state = state;
  title.textContent = heading;
  text.textContent = message;
}

function showDetails(payment) {
  const rows = [
    ['Plan', payment.planName],
    ['Amount', taka(payment.finalAmount)],
    payment.discountAmount > 0 ? ['Discount', `-${taka(payment.discountAmount)}`] : null,
    payment.accessEndsAt ? ['Premium until', formatDateTime(payment.accessEndsAt)] : null
  ].filter(Boolean);
  details.replaceChildren(...rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })]));
  details.hidden = false;
}

function addAction(label, href, primary = false) {
  actions.prepend(el('a', { className: `button ${primary ? 'button-primary' : 'button-secondary'}`, text: label, attrs: { href } }));
}

const wait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

async function poll() {
  for (let attempt = 0; attempt <= POLL_DELAYS_MS.length; attempt += 1) {
    let payment;
    try {
      payment = await apiRequest(`/api/premium/payments/${encodeURIComponent(publicId)}`, { auth: true });
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        show('failed', 'We could not show this payment', 'Sign in with the account that made the payment to see its result.');
        addAction('Sign in', `login.html?returnTo=${encodeURIComponent(`payment-result.html${window.location.search}`)}`, true);
        return;
      }
      payment = null;
    }

    if (payment?.status === 'SUCCEEDED') {
      show('success', 'Premium is active', 'Thank you. Your payment was confirmed and every Premium feature is unlocked.');
      showDetails(payment);
      addAction('Open Premium tools', 'premium.html', true);
      return;
    }
    if (payment && ['FAILED', 'CANCELLED', 'REFUNDED'].includes(payment.status)) {
      const cancelled = payment.status === 'CANCELLED';
      show(cancelled ? 'cancelled' : 'failed',
        cancelled ? 'Payment cancelled' : 'Payment not completed',
        cancelled ? 'No payment was taken. You can choose a plan again whenever you like.'
          : 'The payment did not go through, so nothing was charged for Premium. You can try again.');
      return;
    }
    // A cancelled or failed return with no settled payment can be shown at
    // once; a success waits for the server to confirm it.
    if (result === 'cancel' && attempt === 0) {
      show('cancelled', 'Payment cancelled', 'No payment was taken. You can choose a plan again whenever you like.');
      return;
    }
    if (result === 'fail' && attempt === 0) {
      show('failed', 'Payment not completed', 'The payment did not go through, so nothing was charged for Premium. You can try again.');
      return;
    }
    if (attempt === POLL_DELAYS_MS.length) break;
    await wait(POLL_DELAYS_MS[attempt]);
  }

  show('pending', 'Still confirming your payment',
    'SSLCommerz has not confirmed this payment yet. If money was taken, Premium will appear automatically once it is confirmed. Check your Premium status again in a few minutes.');
  addAction('Check again', window.location.href, true);
}

if (!publicId || !UUID.test(publicId)) {
  show('failed', 'No payment to show', 'This page opens after checkout. Choose a plan on the Premium page to begin.');
} else if (!isAuthenticated()) {
  show('failed', 'Sign in to see this payment', 'Sign in with the account that made the payment to see its result.');
  addAction('Sign in', `login.html?returnTo=${encodeURIComponent(`payment-result.html${window.location.search}`)}`, true);
} else {
  poll();
}
