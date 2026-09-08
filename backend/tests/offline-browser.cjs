// SAPLE_PLAYWRIGHT can point to an external Playwright installation.
const { chromium } = require(process.env.SAPLE_PLAYWRIGHT || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../frontend');
let mode = 'online'; let writes = 0;
const company = { companyId: 1, companyName: 'Offline Test Company', industry: 'Technology', headquartersCity: 'Dhaka', country: 'Bangladesh', reviewCount: 0, communitySalaryCount: 1, communityMinimumSalary: 20000, communityMaximumSalary: 40000 };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (mode === 'down' || (mode === 'api-down' && url.pathname.startsWith('/api/'))) {
    if (req.method !== 'GET') writes++;
    res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, message: 'Test outage' })); return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'deleted' && url.pathname === '/api/companies/1') { res.writeHead(404).end(JSON.stringify({ success: false, message: 'Company deleted' })); return; }
    let data = [];
    if (url.pathname === '/api/companies') data = [company];
    if (url.pathname === '/api/companies/1') data = company;
    if (url.pathname.endsWith('/filter-options')) data = { industries: ['Technology'], locations: ['Dhaka'], companySizes: [] };
    if (url.pathname.endsWith('/salary-summary')) data = { verified: [], community: [] };
    if (url.pathname.endsWith('/reviews')) data = { reviews: [], summary: {} };
    if (url.pathname === '/api/auth/me') data = { user: { fullName: 'Private Marker', email: 'private-marker@example.test', verifiedScopes: [] } };
    if (req.method !== 'GET') { writes++; data = { privateToken: 'private-marker-token' }; }
    res.end(JSON.stringify({ success: true, data })); return;
  }
  const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); res.end(body);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext(); const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/companies.html`); await page.waitForSelector('.company-card');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.goto(`${origin}/company-details.html?id=1`); await page.waitForSelector('#company-content:not([hidden])');
    await page.evaluate(async () => {
      const { apiRequest } = await import('./js/api.js');
      sessionStorage.setItem('saple.auth.token', 'fixture');
      await apiRequest('/api/auth/me', { auth: true });
      await apiRequest('/api/auth/register', { method: 'POST', body: { sample: true } });
      sessionStorage.clear();
    });
    assert.doesNotMatch(await page.evaluate(() => localStorage.getItem('saple.public-cache.v1')), /private-marker|\/auth\//i);
    mode = 'api-down'; await page.goto(`${origin}/companies.html`);
    await page.waitForSelector('.company-card'); assert.match(await page.locator('#offline-notice').textContent(), /saved public data from/);
    assert.equal(await page.locator('.directory-results .badge').textContent(), 'Saved directory');
    const countBefore = writes;
    const failed = await page.evaluate(async () => {
      const { apiRequest } = await import('./js/api.js');
      try { await apiRequest('/api/auth/register', { method: 'POST', body: {} }); return false; } catch { return true; }
    });
    assert.equal(failed, true); assert.equal(writes, countBefore + 1);
    mode = 'down'; await page.reload(); await page.waitForSelector('.company-card');
    await page.goto(`${origin}/company-details.html?id=1`); await page.waitForSelector('#company-content:not([hidden])');
    assert.match(await page.locator('#overview h1').textContent(), /Offline Test Company/);
    await page.goto(`${origin}/index.html`); await page.waitForSelector('#offline-notice');
    await context.setOffline(true); await page.goto(`${origin}/companies.html`); await page.waitForSelector('.company-card');
    await page.setViewportSize({ width: 320, height: 768 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(process.env.TEMP || '/tmp', 'saple-offline-mobile.png') });
    await context.setOffline(false); mode = 'online'; await page.reload(); await page.waitForSelector('.company-card');
    assert.equal(await page.locator('#offline-notice').count(), 0);
    assert.equal(writes, countBefore + 1, 'Offline writes are not queued or replayed');
    mode = 'deleted'; await page.goto(`${origin}/company-details.html?id=1`); await page.waitForSelector('#details-status.error');
    assert.match(await page.locator('#details-status').textContent(), /Company deleted/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('saple.public-cache.v1')).some((entry) => new URL(entry.key).pathname === '/api/companies/1')), false);
    await page.evaluate(() => {
      const entries = JSON.parse(localStorage.getItem('saple.public-cache.v1'));
      entries.forEach((entry) => { entry.savedAt = Date.now() - 8 * 86400000; });
      localStorage.setItem('saple.public-cache.v1', JSON.stringify(entries));
    });
    mode = 'api-down'; await page.goto(`${origin}/companies.html`); await page.waitForSelector('#company-status.error');
    assert.equal(await page.locator('.company-card').count(), 0);
    await page.getByRole('button', { name: 'Clear saved data' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('saple.public-cache.v1')), null);
    assert.deepEqual(errors, []);
    console.log('PASS: API 503, complete server outage, offline reload/navigation, timestamps, mobile layout, recovery, private-data exclusion, no write replay, 404 eviction, expiry and clearing cached data.');
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });
