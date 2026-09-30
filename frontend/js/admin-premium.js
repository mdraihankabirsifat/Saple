import { apiRequest } from './api.js';
import { el, clear, renderErrorState, formatDateTime, humanizeEnum, showToast } from './ui.js';

// Administrator Premium panel: the overview and promo/referral codes. It never
// shows gateway secrets, card or mobile-wallet details; the API does not hold
// them to begin with.

function taka(value) {
  const amount = Number(value);
  return `৳${Number.isInteger(amount) ? amount.toLocaleString('en-US') : amount.toFixed(2)}`;
}

function stat(label, value) {
  return el('div', { className: 'premium-stat' }, [el('dt', { text: label }), el('dd', { text: value })]);
}

function renderOverview(host, overview) {
  const statuses = overview.statusCounts.length
    ? overview.statusCounts.map((row) => `${humanizeEnum(row.status)}: ${row.count}`).join(' · ')
    : 'No payments yet';
  const plans = overview.planDistribution
    .map((row) => `${row.name}: ${row.successfulPayments}`).join(' · ');

  const table = overview.recentPayments.length
    ? el('div', { className: 'table-scroll' }, [el('table', { className: 'compare-table' }, [
      el('thead', {}, [el('tr', {}, ['Member', 'Plan', 'Amount', 'Status', 'Started'].map((heading) =>
        el('th', { text: heading, attrs: { scope: 'col' } })))]),
      el('tbody', {}, overview.recentPayments.map((payment) => el('tr', {}, [
        el('td', { text: payment.fullName }),
        el('td', { text: payment.planName }),
        el('td', { text: taka(payment.finalAmount) }),
        el('td', { text: humanizeEnum(payment.status) }),
        el('td', { text: formatDateTime(payment.createdAt) })
      ])))
    ])])
    : el('p', { className: 'field-help', text: 'No payments have been started yet.' });

  host.replaceChildren(
    el('dl', { className: 'premium-stat-grid' }, [
      stat('Active paid members', String(overview.activePaid)),
      stat('Active trials', String(overview.activeTrials)),
      stat('Trials ever claimed', String(overview.trialsClaimed)),
      stat('Successful revenue', taka(overview.revenueBdt))
    ]),
    el('p', { className: 'field-help', text: `Payments by status: ${statuses}` }),
    el('p', { className: 'field-help', text: `Successful payments by plan: ${plans || 'none yet'}` }),
    el('h3', { text: 'Recent payments' }),
    table
  );
}

function promoCard(promo, reload) {
  const toggle = el('button', {
    className: 'button button-secondary button-small',
    text: promo.isActive ? 'Deactivate' : 'Reactivate',
    attrs: { type: 'button' }
  });
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await apiRequest(`/api/admin/premium/promo-codes/${promo.promoCodeId}/active`, {
        method: 'PATCH', auth: true, body: { isActive: !promo.isActive }
      });
      showToast(`Code ${promo.code} ${promo.isActive ? 'deactivated' : 'reactivated'}.`, 'success');
      reload();
    } catch (error) {
      toggle.disabled = false;
      showToast(error.message, 'error');
    }
  });

  const value = promo.discountType === 'PERCENT' ? `${promo.discountValue}% off` : `${taka(promo.discountValue)} off`;
  return el('article', { className: 'queue-card card' }, [
    el('div', { className: 'queue-head' }, [
      el('div', {}, [
        el('h3', { className: 'queue-title', text: promo.code }),
        el('p', { className: 'queue-subtitle', text: promo.description || value })
      ]),
      el('span', {
        className: `status-badge status-${promo.currentlyValid ? 'positive' : 'neutral'}`,
        text: promo.currentlyValid ? 'Valid now' : promo.isActive ? 'Scheduled or expired' : 'Inactive'
      })
    ]),
    el('dl', { className: 'queue-facts' }, [
      el('div', {}, [el('dt', { text: 'Discount' }), el('dd', {
        text: promo.maxDiscountBdt ? `${value}, up to ${taka(promo.maxDiscountBdt)}` : value
      })]),
      el('div', {}, [el('dt', { text: 'Plan' }), el('dd', { text: promo.applicablePlanCode ? humanizeEnum(promo.applicablePlanCode) : 'Any plan' })]),
      el('div', {}, [el('dt', { text: 'Used' }), el('dd', {
        text: `${promo.redeemedCount}${promo.maxRedemptions ? ` of ${promo.maxRedemptions}` : ''} · ${promo.perUserLimit} per member`
      })]),
      el('div', {}, [el('dt', { text: 'Valid' }), el('dd', {
        text: `${formatDateTime(promo.validFrom)} – ${promo.validUntil ? formatDateTime(promo.validUntil) : 'no end'}`
      })])
    ]),
    el('div', { className: 'queue-actions' }, [toggle])
  ]);
}

function field(label, control, id) {
  control.id = id;
  return el('div', { className: 'form-group' }, [el('label', { text: label, attrs: { for: id } }), control]);
}

function input(attrs = {}) {
  return el('input', { className: 'input', attrs });
}

function selectOf(options) {
  const node = el('select', { className: 'input' });
  for (const [value, label] of options) node.append(el('option', { text: label, attrs: { value } }));
  return node;
}

function isoOrUndefined(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function promoForm(onCreated) {
  const code = input({ maxlength: '40', required: true, autocomplete: 'off', placeholder: 'SAPLE10' });
  const description = input({ maxlength: '300' });
  const type = selectOf([['PERCENT', 'Percent'], ['FIXED', 'Fixed amount (৳)']]);
  const value = input({ type: 'number', min: '1', step: '0.01', required: true });
  const maxDiscount = input({ type: 'number', min: '1', step: '0.01' });
  const plan = selectOf([['', 'Any plan'], ['PREMIUM_1M', '1 month'], ['PREMIUM_3M', '3 months']]);
  const total = input({ type: 'number', min: '1', step: '1' });
  const perUser = input({ type: 'number', min: '1', step: '1', value: '1' });
  const from = input({ type: 'datetime-local' });
  const until = input({ type: 'datetime-local' });
  const submit = el('button', { className: 'button button-primary', text: 'Create code', attrs: { type: 'submit' } });
  const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });

  const form = el('form', { className: 'promo-admin-form', attrs: { novalidate: true } }, [
    field('Code', code, 'promo-new-code'),
    field('Description (optional)', description, 'promo-new-description'),
    field('Type', type, 'promo-new-type'),
    field('Value', value, 'promo-new-value'),
    field('Maximum discount ৳ (optional)', maxDiscount, 'promo-new-max'),
    field('Plan', plan, 'promo-new-plan'),
    field('Total limit (optional)', total, 'promo-new-total'),
    field('Per-member limit', perUser, 'promo-new-per-user'),
    field('Starts (optional)', from, 'promo-new-from'),
    field('Ends (optional)', until, 'promo-new-until'),
    submit,
    feedback
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    feedback.className = 'form-feedback';
    feedback.textContent = '';
    try {
      const created = await apiRequest('/api/admin/premium/promo-codes', {
        method: 'POST',
        auth: true,
        body: {
          code: code.value.trim(),
          description: description.value.trim() || undefined,
          discountType: type.value,
          discountValue: value.value,
          maxDiscountBdt: maxDiscount.value || undefined,
          applicablePlanCode: plan.value || undefined,
          maxRedemptions: total.value || undefined,
          perUserLimit: perUser.value || undefined,
          validFrom: isoOrUndefined(from.value),
          validUntil: isoOrUndefined(until.value)
        }
      });
      showToast(`Code ${created.code} created.`, 'success');
      form.reset();
      onCreated();
    } catch (error) {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

export async function loadPremiumAdmin(panel) {
  const status = panel.querySelector('[data-status]');
  const overviewHost = panel.querySelector('[data-premium-overview]');
  const formHost = panel.querySelector('[data-promo-form]');
  const listHost = panel.querySelector('[data-promo-list]');

  const reloadCodes = async () => {
    try {
      const data = await apiRequest('/api/admin/premium/promo-codes', { auth: true });
      listHost.replaceChildren(...(data.promoCodes.length
        ? data.promoCodes.map((promo) => promoCard(promo, reloadCodes))
        : [el('p', { className: 'field-help', text: 'No promo or referral codes yet.' })]));
    } catch (error) {
      renderErrorState(listHost, error, reloadCodes);
    }
  };

  status.textContent = 'Loading Premium overview…';
  if (!formHost.firstChild) formHost.append(promoForm(reloadCodes));
  try {
    renderOverview(overviewHost, await apiRequest('/api/admin/premium/overview', { auth: true }));
    status.textContent = '';
  } catch (error) {
    status.textContent = 'The Premium overview could not be loaded.';
    clear(overviewHost);
    if (error.status && error.status >= 500) {
      overviewHost.append(el('p', { className: 'field-help', text: 'If migration 009 has not been run yet, Premium tables do not exist.' }));
    }
  }
  await reloadCodes();
}
