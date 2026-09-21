import { fetchApi } from './api.js';
import { el } from './ui.js';

const DISMISSED_KEY = 'saple.dismissed-announcements';

// A dismissal is remembered per announcement and per version, so an edited
// announcement reappears once and then stays dismissed again.
function announcementKey(announcement) {
  return `${announcement.announcementId}:${announcement.updatedAt || ''}`;
}

function readDismissed() {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((value) => typeof value === 'string') : [];
  } catch (error) {
    return [];
  }
}

function rememberDismissed(key) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([key, ...readDismissed()].slice(0, 30)));
  } catch (error) {
    // The bar still works without storage; it simply reappears next visit.
  }
}

function buildBar(announcement, onDismiss) {
  const severity = ['INFO', 'WARNING', 'CRITICAL'].includes(announcement.severity)
    ? announcement.severity
    : 'INFO';
  const labels = { INFO: 'Notice', WARNING: 'Important', CRITICAL: 'Urgent' };

  const bar = el('aside', {
    className: `announcement-bar announcement-${severity.toLowerCase()}`,
    attrs: { role: 'region', 'aria-label': 'Site announcement' },
    dataset: { announcementId: announcement.announcementId, severity }
  }, [
    el('div', { className: 'announcement-inner container' }, [
      // The severity is shown as a word as well as a colour, so the meaning
      // never depends on colour alone.
      el('span', { className: 'announcement-tag', text: labels[severity] }),
      el('div', { className: 'announcement-body' }, [
        el('strong', { className: 'announcement-title', text: announcement.title }),
        el('span', { className: 'announcement-message', text: announcement.message })
      ])
    ])
  ]);

  if (announcement.isDismissible) {
    const dismiss = el('button', {
      className: 'announcement-dismiss',
      attrs: { type: 'button', 'aria-label': `Dismiss announcement: ${announcement.title}` }
    }, [el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' })]);
    dismiss.addEventListener('click', () => {
      rememberDismissed(announcementKey(announcement));
      bar.remove();
      onDismiss?.();
    });
    bar.querySelector('.announcement-inner').append(dismiss);
  }

  return bar;
}

export async function renderAnnouncementBar() {
  const header = document.querySelector('.site-header');
  if (!header || document.querySelector('.announcement-bar')) return;

  let announcements;
  try {
    announcements = await fetchApi('/api/announcements');
  } catch (error) {
    // Announcements are decoration, not content. A failure here must never
    // interrupt the page the reader actually asked for.
    return;
  }

  if (!Array.isArray(announcements) || announcements.length === 0) return;

  const dismissed = new Set(readDismissed());
  const next = announcements.find(
    (announcement) => !announcement.isDismissible || !dismissed.has(announcementKey(announcement))
  );
  if (!next) return;

  header.after(buildBar(next, renderAnnouncementBar));
}

export { announcementKey, readDismissed, DISMISSED_KEY };
