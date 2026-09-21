import { apiRequest } from './api.js';
import { el, clear, formatRelativeTime, trapFocus } from './ui.js';

// Private notifications. Every request is authenticated, so none of this data
// is ever written to the public offline cache.

const PANEL_PAGE_SIZE = 10;

let panel = null;
let releaseFocus = null;
let badge = null;
let toggle = null;

function setBadge(unreadCount) {
  if (!badge || !toggle) return;
  const count = Number(unreadCount) || 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.hidden = count === 0;
  toggle.setAttribute(
    'aria-label',
    count === 0 ? 'Notifications' : `Notifications, ${count} unread`
  );
}

function notificationItem(notification, onRead) {
  const item = el('li', {
    className: `notification-item${notification.isRead ? '' : ' is-unread'}`,
    dataset: { notificationId: notification.notificationId }
  });

  const heading = notification.link
    ? el('a', { className: 'notification-title', text: notification.title, attrs: { href: notification.link } })
    : el('span', { className: 'notification-title', text: notification.title });

  item.append(
    heading,
    el('p', { className: 'notification-message', text: notification.message }),
    el('div', { className: 'notification-meta' }, [
      el('time', {
        className: 'notification-time',
        text: formatRelativeTime(notification.createdAt),
        attrs: { datetime: notification.createdAt }
      }),
      // Unread state is a word as well as a dot, not colour alone.
      notification.isRead ? null : el('span', { className: 'notification-flag', text: 'Unread' })
    ])
  );

  if (!notification.isRead) {
    const markRead = el('button', {
      className: 'notification-read',
      text: 'Mark read',
      attrs: { type: 'button' }
    });
    markRead.addEventListener('click', async () => {
      markRead.disabled = true;
      try {
        const result = await apiRequest(
          `/api/me/notifications/${notification.notificationId}/read`,
          { method: 'PATCH', auth: true }
        );
        item.classList.remove('is-unread');
        item.querySelector('.notification-flag')?.remove();
        markRead.remove();
        setBadge(result.unreadCount);
        onRead?.();
      } catch (error) {
        markRead.disabled = false;
        markRead.textContent = 'Could not mark read';
      }
    });
    item.append(markRead);
  }

  return item;
}

async function loadPanelContents(list, footer) {
  clear(list);
  list.append(el('li', { className: 'notification-loading', text: 'Loading notifications…' }));

  try {
    const result = await apiRequest(
      `/api/me/notifications?pageSize=${PANEL_PAGE_SIZE}`,
      { auth: true }
    );
    setBadge(result.unreadCount);
    clear(list);

    if (!result.items.length) {
      list.append(el('li', {
        className: 'notification-empty',
        text: 'No notifications yet. Decisions about your verification, contributions and job applications appear here.'
      }));
      clear(footer);
      return;
    }

    for (const notification of result.items) {
      list.append(notificationItem(notification, () => loadPanelContents(list, footer)));
    }

    clear(footer);
    if (result.unreadCount > 0) {
      const markAll = el('button', {
        className: 'button button-secondary button-small',
        text: 'Mark all as read',
        attrs: { type: 'button' }
      });
      markAll.addEventListener('click', async () => {
        markAll.disabled = true;
        try {
          await apiRequest('/api/me/notifications/read-all', { method: 'PATCH', auth: true });
          setBadge(0);
          await loadPanelContents(list, footer);
        } catch (error) {
          markAll.disabled = false;
        }
      });
      footer.append(markAll);
    }
  } catch (error) {
    clear(list);
    list.append(el('li', {
      className: 'notification-empty',
      text: error.kind === 'AUTH'
        ? 'Your session has ended. Sign in again to see your notifications.'
        : 'Notifications are unavailable right now. Try again in a moment.'
    }));
  }
}

function closePanel() {
  if (!panel) return;
  releaseFocus?.();
  releaseFocus = null;
  panel.remove();
  panel = null;
  toggle?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', handleOutsideClick, true);
}

function handleOutsideClick(event) {
  if (!panel) return;
  if (panel.contains(event.target) || toggle?.contains(event.target)) return;
  closePanel();
}

function openPanel(container) {
  if (panel) {
    closePanel();
    return;
  }

  const list = el('ul', { className: 'notification-list' });
  const footer = el('div', { className: 'notification-footer' });

  panel = el('div', {
    className: 'notification-panel',
    attrs: { role: 'dialog', 'aria-label': 'Notifications', tabindex: '-1' }
  }, [
    el('div', { className: 'notification-head' }, [
      el('h2', { className: 'notification-heading', text: 'Notifications' }),
      (() => {
        const close = el('button', {
          className: 'notification-close',
          attrs: { type: 'button', 'aria-label': 'Close notifications' }
        }, [el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' })]);
        close.addEventListener('click', closePanel);
        return close;
      })()
    ]),
    list,
    footer
  ]);

  container.append(panel);
  toggle.setAttribute('aria-expanded', 'true');
  releaseFocus = trapFocus(panel, { onEscape: closePanel });
  panel.focus();
  document.addEventListener('click', handleOutsideClick, true);
  loadPanelContents(list, footer);
}

// Mounted only for a signed-in account, from nav.js.
export function mountNotificationBell(navigationActions, anchorBefore = null) {
  if (!navigationActions || navigationActions.querySelector('[data-notification-bell]')) return;

  const container = el('div', { className: 'notification-bell', dataset: { notificationBell: '' } });
  toggle = el('button', {
    className: 'notification-toggle',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', 'aria-label': 'Notifications' }
  }, [
    el('span', { className: 'notification-icon', attrs: { 'aria-hidden': 'true' } })
  ]);
  badge = el('span', { className: 'notification-badge', text: '0', attrs: { hidden: true } });
  toggle.append(badge);
  toggle.addEventListener('click', () => openPanel(container));
  container.append(toggle);
  navigationActions.insertBefore(container, anchorBefore);

  apiRequest('/api/me/notifications/unread-count', { auth: true })
    .then((result) => setBadge(result.unreadCount))
    .catch(() => setBadge(0));

  return container;
}

export { closePanel, setBadge };
