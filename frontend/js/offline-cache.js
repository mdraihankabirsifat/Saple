const CACHE_KEY = 'saple.public-cache.v1';
export const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_SIZE = 1500000;
const pending = new Map();

export function isCacheable(path, method = 'GET', auth = false, headers = {}) {
  if (method !== 'GET' || auth || Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) return false;
  const pathname = path.split('?')[0];
  // An explicit allow-list of public, read-only endpoints. Anything not named
  // here, including every /api/me, /api/representative, /api/admin and
  // /api/assistant path, is never written to browser storage.
  return /^\/api\/(?:companies(?:\/filter-options|\/\d+(?:\/(?:benefits|salary-summary|reviews|interviews))?)?|job-roles|salaries|reviews|interviews|jobs(?:\/filter-options|\/\d+)?|announcements|stats\/overview)$/.test(pathname);
}
function entries() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((entry) => typeof entry.key === 'string'
      && Number.isFinite(entry.savedAt) && entry.savedAt <= Date.now() && Date.now() - entry.savedAt < MAX_AGE) : [];
  } catch { return []; }
}
export function cacheKey(baseUrl, path) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`); url.searchParams.sort(); return url.href;
}
export function savePublicData(key, data) {
  try {
    const item = { key, savedAt: Date.now(), data };
    if (JSON.stringify(item).length > MAX_SIZE) return;
    const saved = [item, ...entries().filter((entry) => entry.key !== key)].slice(0, 30);
    while (JSON.stringify(saved).length > MAX_SIZE) saved.pop();
    localStorage.setItem(CACHE_KEY, JSON.stringify(saved));
  } catch { /* Browsing still works when storage is unavailable or full. */ }
}
export function readPublicData(key) { return entries().find((entry) => entry.key === key) || null; }
export function removePublicData(key) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entries().filter((entry) => entry.key !== key))); } catch { /* Optional cache. */ }
}
export function showOfflineNotice(key = 'page', savedAt = null) {
  pending.set(key, savedAt);
  if (!document.body) return;
  let notice = document.querySelector('#offline-notice');
  if (!notice) {
    notice = document.createElement('aside'); notice.id = 'offline-notice'; notice.className = 'offline-notice';
    notice.setAttribute('role', 'status');
    const text = document.createElement('p');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'button button-secondary button-small'; retry.textContent = 'Try reconnecting';
    retry.addEventListener('click', () => location.reload());
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'button button-secondary button-small'; clear.textContent = 'Clear saved data';
    clear.addEventListener('click', () => { try { localStorage.removeItem(CACHE_KEY); } catch { /* Optional storage. */ } location.reload(); });
    notice.append(text, retry, clear); document.querySelector('main')?.prepend(notice);
  }
  const dates = [...pending.values()].filter(Number.isFinite);
  notice.querySelector('p').textContent = dates.length
    ? `Offline browsing: showing saved public data from ${new Date(Math.min(...dates)).toLocaleString()}. It may be outdated. Sign-in and changes require the API.`
    : 'Saple is offline. Previously saved public pages may be available. Sign-in and changes require the API.';
  document.querySelectorAll('.directory-results .badge').forEach((badge) => { badge.textContent = 'Saved directory'; });
}
export function markLive(key) {
  pending.delete(key);
  if (!pending.size) {
    document.querySelector('#offline-notice')?.remove();
    document.querySelectorAll('.directory-results .badge').forEach((badge) => { badge.textContent = 'Live directory'; });
  }
}
