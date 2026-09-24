// Saple service worker.
//
// It caches first-party static files only. No API response of any kind passes
// through it: the allow-list below is a fixed set of HTML, CSS and JS files,
// and anything not in it is left entirely to the network. Public API data is
// handled separately and explicitly by js/offline-cache.js.
//
// Bump SHELL_CACHE whenever the asset list changes. Old versions are deleted
// on activation, so a previous worker's files cannot linger.
const SHELL_CACHE = 'saple-shell-v4';
const ASSETS = [
  'index.html', 'about.html', 'faq.html', 'companies.html', 'company-details.html',
  'salaries.html', 'reviews.html', 'interviews.html', 'jobs.html', 'job-details.html',
  'login.html', 'register.html', 'forgot-password.html', 'reset-password.html',
  'privacy.html', 'terms.html', 'security.html', 'contact.html',
  'css/common.css', 'css/home.css', 'css/info-pages.css', 'css/companies.css', 'css/company-details.css',
  'css/auth.css', 'css/forms.css', 'css/browse.css', 'css/profile.css', 'css/salary-form.css',
  'css/jobs.css',
  'js/nav.js', 'js/theme.js', 'js/api.js', 'js/auth.js', 'js/ui.js', 'js/offline-cache.js',
  'js/announcements.js', 'js/assistant.js', 'js/companies.js', 'js/company-directory.js',
  'js/company-logo.js', 'js/salary-range.js', 'js/company-details.js', 'js/browse-shared.js', 'js/browse-controls.js',
  'js/contribution-access.js', 'js/salaries.js', 'js/reviews.js', 'js/interviews.js',
  'js/home.js', 'js/jobs.js', 'js/job-details.js',
  'js/login.js', 'js/register.js', 'js/forgot-password.js', 'js/reset-password.js', 'js/faq.js'
].map((file) => new URL(file, self.registration.scope).href);
const allowed = new Set(ASSETS);
const offlinePages = new Set();

// Pages and scripts that only ever show one account's private data. They are
// deliberately absent from ASSETS above; this list makes that a rule rather
// than an omission, and a purge removes anything an older worker stored.
const PRIVATE_PATHS = [
  'profile.html', 'admin.html', 'representative.html', 'my-applications.html',
  'employee-verification.html', 'submit-salary.html', 'submit-review.html',
  'interview-experience.html',
  'js/profile.js', 'js/admin.js', 'js/representative.js', 'js/my-applications.js',
  'js/notifications.js', 'js/verification.js', 'js/submit-salary.js', 'js/review.js',
  'js/interview.js', 'js/representative-request.js', 'js/admin-oversight.js',
  'js/require-session.js',
  'css/admin.css', 'css/workspace.css'
].map((file) => new URL(file, self.registration.scope).href);

self.addEventListener('install', (event) => {
  // Atomic installation: retain the previous worker if any required asset fails.
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('saple-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    }
    // Remove anything an earlier version of this worker may have stored for a
    // private page, even though the current version would never store it.
    const cache = await caches.open(SHELL_CACHE);
    for (const href of PRIVATE_PATHS) await cache.delete(href);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SAPLE_OFFLINE_STATUS' && offlinePages.has(event.source?.id)) {
    event.source.postMessage('SAPLE_OFFLINE_PAGE');
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // A request that carries credentials is never a shell asset.
  if (request.headers.has('Authorization')) return;

  const url = new URL(request.url); url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';

  // Only static first-party files. API responses, authentication, private
  // workspaces and the Saple Guide never pass through this cache.
  if (url.pathname.includes('/api/')) return;
  if (!allowed.has(url.href) || PRIVATE_PATHS.includes(url.href)) return;

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
