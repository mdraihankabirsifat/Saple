// One classification of Saple's pages, used by robots.txt, sitemap.xml, the
// X-Robots-Tag header and the tests that keep the HTML in step.
//
// Public pages are the directory itself: they are meant to be found. Private
// pages are account flows and workspaces. A page that shows, collects or
// changes account data is never indexable, and neither is any /api/ path.

const PUBLIC_PAGES = Object.freeze([
  { path: '/', file: 'index.html', changefreq: 'weekly', priority: '1.0' },
  { path: '/companies.html', file: 'companies.html', changefreq: 'daily', priority: '0.9' },
  { path: '/company-details.html', file: 'company-details.html', changefreq: 'weekly', priority: '0.7' },
  { path: '/jobs.html', file: 'jobs.html', changefreq: 'daily', priority: '0.9' },
  { path: '/job-details.html', file: 'job-details.html', changefreq: 'daily', priority: '0.7' },
  { path: '/salaries.html', file: 'salaries.html', changefreq: 'daily', priority: '0.8' },
  { path: '/reviews.html', file: 'reviews.html', changefreq: 'daily', priority: '0.8' },
  { path: '/interviews.html', file: 'interviews.html', changefreq: 'daily', priority: '0.8' },
  { path: '/about.html', file: 'about.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/faq.html', file: 'faq.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy.html', file: 'privacy.html', changefreq: 'yearly', priority: '0.4' },
  { path: '/terms.html', file: 'terms.html', changefreq: 'yearly', priority: '0.4' },
  { path: '/security.html', file: 'security.html', changefreq: 'yearly', priority: '0.4' },
  { path: '/contact.html', file: 'contact.html', changefreq: 'yearly', priority: '0.4' }
]);

// Authentication, account, contribution and privileged pages. Every one of
// these carries <meta name="robots" content="noindex, nofollow"> as well, so
// the protection does not depend on a single mechanism.
const PRIVATE_PAGES = Object.freeze([
  '/login.html',
  '/register.html',
  '/forgot-password.html',
  '/reset-password.html',
  '/profile.html',
  '/my-applications.html',
  '/employee-verification.html',
  '/submit-salary.html',
  '/submit-review.html',
  '/interview-experience.html',
  '/representative.html',
  '/admin.html'
]);

const DISALLOWED_PATHS = Object.freeze(['/api/', ...PRIVATE_PAGES]);

const NOINDEX_VALUE = 'noindex, nofollow';

// True for a private page, its directory-style variant, and anything under /api/.
function isPrivatePath(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  const normalized = pathname.toLowerCase().split('?')[0].replace(/\/+$/, '') || '/';
  if (normalized.startsWith('/api/') || normalized === '/api') return true;
  return PRIVATE_PAGES.some((page) => normalized === page.replace(/\.html$/, '') || normalized === page);
}

module.exports = {
  PUBLIC_PAGES,
  PRIVATE_PAGES,
  DISALLOWED_PATHS,
  NOINDEX_VALUE,
  isPrivatePath
};
