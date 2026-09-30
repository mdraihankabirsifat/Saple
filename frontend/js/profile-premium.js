import { apiRequest } from './api.js';
import { el, formatDateTime, formatRelativeTime } from './ui.js';
import { premiumBadge } from './premium-ui.js';

// The Premium card on the member's own profile: their Premium state, and who
// viewed their profile. Everyone sees the count; only Premium members receive
// viewer identities, and the server enforces that, not this file.

function viewerItem(viewer) {
  const initial = (viewer.fullName || '?').trim().charAt(0).toUpperCase();
  const avatar = viewer.avatarUrl
    ? el('img', { className: 'viewer-avatar', attrs: { src: viewer.avatarUrl, alt: '', loading: 'lazy' } })
    : el('span', { className: 'viewer-avatar viewer-avatar-initial', text: initial, attrs: { 'aria-hidden': 'true' } });
  return el('li', { className: 'viewer-item' }, [
    avatar,
    el('div', { className: 'viewer-body' }, [
      el('p', {}, [
        el('a', { text: viewer.fullName, attrs: { href: `user-profile.html?id=${encodeURIComponent(viewer.userId)}` } }),
        viewer.premiumBadge ? ' ' : null,
        premiumBadge(viewer.premiumBadge)
      ]),
      el('p', { className: 'viewer-meta', text: [viewer.headline, `Viewed ${formatRelativeTime(viewer.lastViewedAt)}`].filter(Boolean).join(' · ') })
    ])
  ]);
}

export async function mountProfilePremium() {
  const card = document.querySelector('#profile-premium');
  if (!card) return;
  const stateLine = card.querySelector('#profile-premium-state');
  const count = card.querySelector('#profile-views-count');
  const caption = card.querySelector('#profile-views-caption');
  const list = card.querySelector('#profile-viewers');
  const action = card.querySelector('#profile-viewers-action');

  let access = null;
  try {
    access = await apiRequest('/api/premium/status', { auth: true });
  } catch {
    access = null;
  }

  if (access?.hasPremium) {
    stateLine.replaceChildren(
      premiumBadge({ premium: true, label: access.source === 'TRIAL' ? 'Premium trial' : 'Premium Saple member' }),
      ` Active until ${formatDateTime(access.endsAt)}.`
    );
  } else {
    stateLine.replaceChildren('Free plan. ', el('a', { text: 'See Premium', attrs: { href: 'premium.html' } }));
  }

  try {
    const summary = await apiRequest('/api/me/profile-view-summary', { auth: true });
    const viewers = summary.signedInViewersLast30Days;
    count.textContent = String(viewers);
    caption.textContent = viewers === 1
      ? 'signed-in member viewed your profile in the last 30 days.'
      : 'signed-in members viewed your profile in the last 30 days.';
    count.hidden = false;
    caption.hidden = false;

    if (!summary.canSeeIdentities) {
      action.replaceChildren(el('a', { text: 'See who viewed your profile with Premium', attrs: { href: 'premium.html' } }));
      return;
    }
    const page = await apiRequest('/api/me/profile-viewers?pageSize=10', { auth: true });
    if (!page.items.length) {
      action.textContent = 'No one has viewed your profile recently.';
      return;
    }
    list.replaceChildren(...page.items.map(viewerItem));
    list.hidden = false;
    action.textContent = '';
  } catch {
    caption.textContent = 'Profile views are not available right now.';
    caption.hidden = false;
  }
}
