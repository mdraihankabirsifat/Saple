// Bump the shell version when changing the offline asset list.
const SHELL_CACHE = 'saple-shell-v1';
const ASSETS = [
  'index.html', 'about.html', 'faq.html', 'companies.html', 'company-details.html',
  'salaries.html', 'reviews.html', 'interviews.html', 'login.html', 'register.html',
  'forgot-password.html', 'reset-password.html', 'profile.html', 'admin.html',
  'employee-verification.html', 'submit-salary.html', 'submit-review.html', 'interview-experience.html',
  'css/common.css', 'css/home.css', 'css/info-pages.css', 'css/companies.css', 'css/company-details.css',
  'css/auth.css', 'css/forms.css', 'css/browse.css', 'css/profile.css', 'css/admin.css', 'css/salary-form.css',
  'js/nav.js', 'js/theme.js', 'js/api.js', 'js/auth.js', 'js/offline-cache.js', 'js/companies.js',
  'js/company-directory.js', 'js/company-logo.js', 'js/salary-range.js', 'js/company-details.js',
  'js/browse-shared.js', 'js/contribution-access.js', 'js/salaries.js', 'js/reviews.js', 'js/interviews.js',
  'js/login.js', 'js/register.js', 'js/forgot-password.js', 'js/reset-password.js', 'js/profile.js',
  'js/admin.js', 'js/verification.js', 'js/submit-salary.js', 'js/review.js', 'js/interview.js', 'js/faq.js'
].map((file) => new URL(file, self.registration.scope).href);
const allowed = new Set(ASSETS);
const offlinePages = new Set();
self.addEventListener('install', (event) => {
  // Atomic installation: retain the previous worker if any required asset fails.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('saple-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data === 'SAPLE_OFFLINE_STATUS' && offlinePages.has(event.source?.id)) event.source.postMessage('SAPLE_OFFLINE_PAGE');
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url); url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  // Only static first-party files. API responses, authentication and uploads
  // never pass through this cache; public data is handled explicitly by api.js.
  if (!allowed.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(request, { signal: controller.signal });
      if (response.status >= 500) throw new Error('Server unavailable');
      if (response.ok && !response.redirected) await cache.put(url.href, response.clone());
      offlinePages.delete(event.resultingClientId || event.clientId);
      return response;
    } catch {
      const saved = await cache.match(url.href);
      if (saved) {
        if (request.mode === 'navigate') offlinePages.add(event.resultingClientId || event.clientId);
        return saved;
      }
      return Response.error();
    } finally { clearTimeout(timeout); }
  })());
});
