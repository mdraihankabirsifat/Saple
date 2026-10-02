import { apiRequest } from './api.js';
import { action, badge, confirmAction, date, dialog, facts, node, pagination, section, table } from './admin-control-ui.js';

export function mountSubscriptions(host, onChange) {
  let page = 1;
  const ui = section(host, 'Subscriptions', 'Review access and payment status. Manual grants never create payment records.', [
    { name: 'search', label: 'Search', placeholder: 'Name or email' },
    { name: 'filter', label: 'Access', options: [['','All'],['PREMIUM','Premium'],['TRIAL','Trial'],
      ['FREE','Free'],['ADMIN_GRANT','Manual grant'],['PAID','Paid'],['EXPIRED','Expired']] }
  ], load);

  async function view(item, invoking = document.activeElement) {
    try {
      const detail = await apiRequest(`/api/admin/subscriptions/${item.userId}`, { auth: true });
      const body = node('div');
      body.append(facts([['User', detail.fullName], ['Email', detail.email], ['Account', detail.accountStatus],
        ['Trial', detail.trial ? `${date(detail.trial.startsAt)} – ${date(detail.trial.endsAt)}` : 'Never claimed']]));
      body.append(node('h3', 'Access periods'));
      for (const period of detail.periods) body.append(node('p',
        `${period.source} · ${period.planCode} · ${date(period.startsAt)}–${date(period.endsAt)}${period.revokedAt ? ` · Revoked ${date(period.revokedAt)}` : ''}`));
      if (!detail.periods.length) body.append(node('p', 'No Premium periods.'));
      body.append(node('h3', 'Payment history summary'));
      for (const payment of detail.paymentSummary) body.append(node('p', `${payment.status}: ${payment.count}`));
      if (!detail.paymentSummary.length) body.append(node('p', 'No payments.'));
      body.append(node('h3', 'Promo history'));
      for (const promo of detail.promoHistory) body.append(node('p', `${promo.code} · ${promo.status} · ${date(promo.reservedAt)}`));
      if (!detail.promoHistory.length) body.append(node('p', 'No promo redemptions.'));
      const actions = node('div', '', 'admin-detail-actions');
      for (const days of [30, 90]) actions.append(action(`Grant or extend ${days} days`, () => {
        modal.close();
        confirmAction({ title: `Grant ${days} days of Premium`, message: `${detail.fullName} · ${detail.email}`,
          confirmLabel: 'Grant Premium', invoking, danger: false,
          onConfirm: async (reason) => {
            await apiRequest(`/api/admin/subscriptions/${detail.userId}/grant`, { method: 'POST', auth: true, body: { days, reason } });
            await load(page); await onChange();
          } });
      }, 'primary'));
      if (detail.periods.some((period) => !period.revokedAt && new Date(period.endsAt) > new Date()) ||
        (detail.trial && !detail.trial.revokedAt && new Date(detail.trial.endsAt) > new Date())) {
        actions.append(action('Revoke Premium', () => {
          modal.close();
          confirmAction({ title: `Revoke Premium for ${detail.fullName}?`, message: 'Current Premium access ends immediately. Payment history stays intact.',
            confirmLabel: 'Revoke Premium', invoking,
            onConfirm: async (reason) => {
              await apiRequest(`/api/admin/subscriptions/${detail.userId}/revoke`, { method: 'POST', auth: true, body: { reason } });
              await load(page); await onChange();
            } });
        }, 'danger'));
      }
      body.append(actions);
      const modal = dialog(`Subscription #${detail.userId}`, body, invoking);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }

  async function load(nextPage = 1) {
    page = nextPage; ui.status.textContent = 'Loading subscriptions…';
    try {
      const params = new URLSearchParams({ ...ui.read(), page: String(page), pageSize: '20' });
      const result = await apiRequest(`/api/admin/subscriptions?${params}`, { auth: true });
      ui.status.textContent = `${result.total} matching accounts`;
      table(ui.list, [['User', (item) => item.fullName], ['Email', (item) => item.email],
        ['Access', (item) => badge(item.source || (item.trialEndsAt && new Date(item.trialEndsAt) > new Date() ? 'TRIAL' : 'FREE'))],
        ['Plan', (item) => item.planCode], ['Starts', (item) => date(item.startsAt)], ['Ends', (item) => date(item.endsAt)],
        ['Trial used', (item) => item.trialUsed ? 'Yes' : 'No'],
        ['Latest payment', (item) => item.paymentStatus || 'None']], result.items, (item) => view(item));
      pagination(ui.pager, page, 20, result.total, load);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  return { load, view: (userId) => view({ userId }) };
}
