// Run explicitly with SAPLE_PLAYWRIGHT pointing to an external Playwright install.
// Uses a local static server and fixture API responses; never writes live data.
const { chromium } = require(process.env.SAPLE_PLAYWRIGHT || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../frontend');
const output = process.env.TEMP || '/tmp';
const companies = Array.from({ length: 127 }, (_, i) => ({ companyId: i + 1, companyName: `Company ${String(i + 1).padStart(3, '0')}`,
  industry: 'Technology', headquartersCity: 'Dhaka', country: 'Bangladesh', companySize: '100-500', website: null,
  reviewCount: i % 5, averageRating: i % 5 ? 1 + i % 5 : null, interviewCount: 2,
  communitySalaryCount: 2, communityMinimumSalary: 20000 + i * 1000, communityMaximumSalary: 40000 + i * 1000,
  verifiedSalaryCount: 1, verifiedMinimumSalary: 300000 - i * 1000, verifiedMaximumSalary: 400000 - i * 1000 }));
const salary = { roleName: 'Software engineer', payPeriod: 'MONTHLY', currency: 'BDT', minimumSalary: 30000, maximumSalary: 150000, averageSalary: 90000, contributionCount: 7 };
const review = { submissionId: 1, companyId: 1, companyName: companies[0].companyName, roleName: salary.roleName, reviewTitle: 'A thoughtful and supportive workplace', pros: 'Helpful colleagues and opportunities to learn.', cons: 'Planning can be improved.', overallRating: 4, reviewDate: '2026-09-01', verificationStatus: 'VERIFIED', employmentStatus: 'CURRENT' };
const interview = { ...review, processDescription: 'Technical discussion followed by a team interview.', questionsSummary: 'Data structures and system design', difficultyLevel: 'MEDIUM', roundsCount: 2, durationDays: 7, interviewMode: 'ONLINE', resultStatus: 'OFFERED', interviewDate: '2026-08-01' };
const scope = { companyId: 1, companyName: companies[0].companyName, roleId: 1, roleName: salary.roleName };
function userFor(role) { return { fullName: 'Sample User', email: 'sample@example.com', accountRole: role === 'admin' ? 'ADMIN' : 'USER', accountStatus: 'ACTIVE', userType: ['employee', 'verified', 'admin'].includes(role) ? 'EMPLOYEE' : 'NORMAL', employmentStatus: 'CURRENT', verifiedScopes: ['verified', 'admin'].includes(role) ? [scope] : [] }; }
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); res.end(data);
  });
});
async function fixture(context, role) {
  await context.addInitScript(({ role, user }) => {
    if (role !== 'anonymous') { sessionStorage.setItem('saple.auth.token', 'fixture'); sessionStorage.setItem('saple.auth.user', JSON.stringify(user)); }
  }, { role, user: userFor(role) });
  await context.route('**/api/**', (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    let data = [];
    if (p === '/api/auth/me') data = { user: userFor(role) };
    else if (p.endsWith('/me/submissions')) data = { submissions: [{ ...review, submissionType: 'REVIEW', submissionStatus: 'APPROVED' }] };
    else if (p.endsWith('/filter-options')) data = { industries: ['Technology'], locations: ['Dhaka'], companySizes: ['100-500'] };
    else if (p === '/api/job-roles') data = [{ roleId: 1, roleName: salary.roleName }];
    else if (p === '/api/companies') data = companies.filter((c) => !url.searchParams.get('search') || c.companyName.toLowerCase().includes(url.searchParams.get('search').toLowerCase()));
    else if (/\/companies\/\d+$/.test(p)) data = { ...companies[0], description: 'Company information and workplace insights.' };
    else if (p.endsWith('/salary-summary')) data = { verified: [salary], community: [salary] };
    else if (p.endsWith('/benefits')) data = [{ benefitName: 'Health insurance', benefitCategory: 'Health', description: 'Health support for employees.' }];
    else if (/\/companies\/\d+\/reviews/.test(p)) data = { reviews: [review], summary: { reviewCount: 1, overallAverage: 4 } };
    else if (p.endsWith('/reviews')) data = [review];
    else if (p.endsWith('/interviews')) data = [interview];
    else if (p === '/api/salaries') data = [{ ...companies[0], ...salary, communityContributionCount: 2, verifiedContributionCount: 1, communityAverageSalary: 30000, verifiedAverageSalary: 40000 }];
    else if (p === '/api/admin/submissions/pending') data = [{ ...review, submissionType: 'REVIEW', submissionStatus: 'PENDING', submittedAt: '2026-09-01', review }];
    else if (p === '/api/admin/verifications/pending') data = [{ verificationId: 1, employeeName: 'Sample Employee', ...scope, employmentStatus: 'CURRENT', verificationMethod: 'COMPANY_EMAIL_OTP', companyEmail: 'employee@example.com' }];
    else if (p === '/api/admin/reports') data = [{ reportId: 1, reasonCategory: 'OTHER', reportStatus: 'OPEN', ...review, submissionType: 'REVIEW', reporterName: 'Sample', reporterEmail: 'reporter@example.com' }];
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.SAPLE_BROWSER || 'chrome', headless: true });
  const failures = []; const errors = []; let checks = 0;
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' }); await fixture(context, 'admin');
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
    const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
    if (process.env.SAPLE_AXE) {
      const violations = [];
      for (const theme of ['light', 'dark']) {
        await page.goto(`${base}/index.html`); await page.evaluate((theme) => localStorage.setItem('saple.theme', theme), theme);
        for (const file of pages) {
          await page.goto(`${base}/${file}${file === 'company-details.html' ? '?id=1' : file === 'reset-password.html' ? '?token=' + 'a'.repeat(64) : ''}`);
          await page.waitForTimeout(60); await page.addScriptTag({ path: process.env.SAPLE_AXE });
          const result = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })));
          if (result.length) violations.push({ file, theme, result });
        }
      }
      console.log(JSON.stringify({ accessibilityChecks: 36, violations }, null, 2));
      assert.deepEqual(violations, []); return;
    }
    for (const theme of ['light', 'dark']) {
      await page.goto(`${base}/index.html`); await page.evaluate((theme) => localStorage.setItem('saple.theme', theme), theme);
      for (const width of [320, 360, 375, 414, 768, 1024, 1366, 1440, 1920]) {
        await page.setViewportSize({ width, height: width >= 1440 ? 1080 : 768 });
        for (const file of pages) {
          await page.goto(`${base}/${file}${file === 'company-details.html' ? '?id=1' : file === 'reset-password.html' ? '?token=' + 'a'.repeat(64) : ''}`);
          await page.waitForTimeout(45);
          const result = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, overflow: document.documentElement.scrollWidth > innerWidth,
            offenders: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => e.className || e.id || e.tagName) }));
          checks++;
          if (result.theme !== theme || result.overflow) failures.push({ file, width, theme, ...result });
          if (file === 'register.html' && width === 1366) {
            await page.check('[name="accountType"][value="EMPLOYEE"]');
            await page.click('.auth-submit');
            const bottom = await page.locator('.auth-switch').evaluate((e) => e.getBoundingClientRect().bottom + scrollY);
            if (bottom > 768) failures.push({ registrationBottom: bottom, theme });
            await page.locator('#register-status').evaluate((element) => {
              element.hidden = false; element.className = 'state-message form-status error';
              element.textContent = 'Unable to create your account. Please try again.';
            });
            const statusBottom = await page.locator('.auth-switch').evaluate((e) => e.getBoundingClientRect().bottom + scrollY);
            if (statusBottom > 768) failures.push({ registrationWithStatusBottom: statusBottom, theme });
            await page.screenshot({ path: path.join(output, `saple-register-${theme}.png`) });
          }
          if (file === 'companies.html' && width === 1366) {
            const initial = await page.locator('.directory-sidebar').boundingBox();
            if (initial.y + initial.height > 768) failures.push({ initialSidebar: initial, theme });
            await page.evaluate(() => scrollTo(0, 500));
            const bounds = await page.locator('.directory-sidebar').boundingBox();
            const header = await page.locator('.site-header').boundingBox();
            if (bounds.y < header.height || bounds.y + bounds.height > 768) failures.push({ sidebar: bounds, header, theme });
            await page.screenshot({ path: path.join(output, `saple-companies-${theme}.png`) });
          }
        }
      }
    }
    console.log(JSON.stringify({ viewportChecks: checks, failures, pageErrors: errors }, null, 2));
    await page.setViewportSize({ width: 1366, height: 768 }); await page.goto(`${base}/companies.html`);
    await page.waitForSelector('.company-card');
    assert.equal(await page.locator('.company-card').count(), 20);
    await page.getByRole('button', { name: 'Page 2', exact: true }).click();
    assert.match(page.url(), /page=2/); assert.match(await page.locator('#company-result-summary').textContent(), /21.*40 of 127/);
    assert.equal(await page.locator('#company-results-heading').evaluate((e) => e === document.activeElement), true);
    await page.reload(); await page.waitForSelector('.company-card'); assert.equal(await page.locator('[aria-current="page"]').last().textContent(), '2');
    await page.selectOption('#company-sort', 'salary-desc'); await page.waitForTimeout(50); assert.ok(!page.url().includes('page=2'));
    assert.match(await page.locator('.company-card h3').first().textContent(), /127/);
    await page.selectOption('#company-salary-source', 'VERIFIED'); await page.getByRole('button', { name: 'Apply filters' }).click();
    assert.match(await page.locator('.company-card h3').first().textContent(), /001/);
    await page.goBack(); await page.waitForTimeout(60); assert.equal(await page.locator('#company-salary-source').inputValue(), 'COMMUNITY');
    await page.fill('#company-max-salary', '100,000'); await page.fill('#company-min-salary', '200,000');
    assert.equal(await page.locator('#company-min-salary').inputValue(), '100,000');
    await page.locator('[data-range-min]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#company-min-salary').inputValue(), '99,000');
    await page.locator('[data-range-max]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#company-max-salary').inputValue(), '101,000');
    await page.setViewportSize({ width: 375, height: 768 }); await page.locator('#directory-filter-toggle').click();
    assert.equal(await page.locator('dialog').evaluate((e) => e.matches(':modal')), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#directory-filter-toggle').evaluate((e) => e === document.activeElement), true);
    await page.locator('#directory-filter-toggle').click(); await page.locator('#clear-search').click(); await page.waitForTimeout(60);
    assert.equal(await page.locator('#active-filter-count').textContent(), '0');
    await page.screenshot({ path: path.join(output, 'saple-companies-mobile.png') });
    await page.locator('#directory-filter-toggle').click();
    await page.locator('#company-search').fill('no matching workplace');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.waitForTimeout(60); assert.equal(await page.locator('.company-card').count(), 0);
    assert.match(await page.locator('#company-status').textContent(), /No companies match/);
    await page.route('**/api/companies?*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Temporarily unavailable' }) }));
    await page.locator('#directory-filter-toggle').click(); await page.locator('#company-search').fill('error');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.waitForTimeout(60); assert.match(await page.locator('#company-status').textContent(), /Temporarily unavailable/);
    assert.equal(await page.locator('#company-list').getAttribute('aria-busy'), 'false');
    for (const role of ['anonymous', 'normal', 'employee', 'verified', 'admin']) {
      const state = await browser.newContext(); await fixture(state, role); const nav = await state.newPage();
      for (const width of [320, 1024, 1366, 1920]) {
        await nav.setViewportSize({ width, height: 768 }); await nav.goto(`${base}/index.html`); await nav.waitForTimeout(60);
        assert.equal(await nav.locator('[data-theme-toggle]').isVisible(), true);
        await nav.locator('[data-theme-toggle]').click();
        assert.equal(await nav.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'true');
        if (width <= 1050) await nav.locator('[data-nav-toggle]').click();
        assert.equal(await nav.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await nav.locator('.contribute-menu').isVisible(), ['verified', 'admin'].includes(role));
        await nav.evaluate(() => localStorage.setItem('saple.theme', 'light'));
      }
      await state.close();
    }
    console.log('PASS: pagination, sorting, history, salary synchronization, keyboard handles, modal focus, and all five navigation states.');
    const logos = await browser.newContext(); const logoPage = await logos.newPage();
    await logoPage.goto(`${base}/index.html`);
    const imageBody = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>';
    await logos.route('https://logos.hunter.io/**', (route) => route.abort());
    await logos.route('https://icons.duckduckgo.com/**', (route) => route.request().url().includes('success.example')
      ? route.fulfill({ contentType: 'image/svg+xml', body: imageBody }) : route.abort());
    await logoPage.evaluate(async () => {
      const { createCompanyLogo } = await import('./js/company-logo.js');
      const panel = document.createElement('section'); panel.id = 'logo-test';
      for (const site of ['https://www.success.example/about', 'failure.example', null, 'javascript:alert(1)']) panel.append(createCompanyLogo('Example Company', site));
      document.querySelector('main').prepend(panel);
    });
    await logoPage.waitForFunction(() => document.querySelector('#logo-test img')?.hidden === false);
    assert.equal(await logoPage.locator('#logo-test .company-logo').count(), 4);
    assert.equal(await logoPage.locator('#logo-test img:not([hidden])').count(), 1);
    assert.equal(await logoPage.locator('#logo-test .company-logo-fallback:not([hidden])').count(), 3);
    await logos.unrouteAll();
    await logoPage.evaluate(async () => {
      document.querySelector('#logo-test').remove();
      const { createCompanyLogo } = await import('./js/company-logo.js');
      const panel = document.createElement('section'); panel.id = 'live-logos';
      for (const [name, website] of [['Microsoft', 'https://www.microsoft.com'], ['Google', 'google.com'], ['ACI', 'https://www.aci-bd.com']]) panel.append(createCompanyLogo(name, website));
      document.querySelector('main').prepend(panel);
    });
    try { await logoPage.waitForFunction(() => [...document.querySelectorAll('#live-logos img')].every((image) => !image.hidden && image.naturalWidth > 0), { timeout: 15000 }); } catch { /* Report actual provider availability separately. */ }
    const liveLogos = await logoPage.locator('#live-logos img').evaluateAll((images) => images.map((image) => ({ alt: image.alt, loaded: !image.hidden && image.naturalWidth > 0, source: image.currentSrc, width: image.naturalWidth })));
    console.log(JSON.stringify({ liveLogos }));
    await logoPage.screenshot({ path: path.join(output, 'saple-live-logos.png') });
    await fixture(logos, 'anonymous');
    const liveCompany = { ...companies[0], companyName: 'Microsoft', website: 'https://www.microsoft.com' };
    await logos.route('**/api/companies', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [liveCompany] }) }));
    await logos.route('**/api/companies/1', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: liveCompany }) }));
    for (const file of ['companies.html', 'company-details.html?id=1']) {
      await logoPage.goto(`${base}/${file}`);
      await logoPage.waitForFunction(() => document.querySelector('.company-logo-image')?.naturalWidth > 0 && !document.querySelector('.company-logo-image').hidden);
      await logoPage.screenshot({ path: path.join(output, file.startsWith('companies.') ? 'saple-directory-real-logo.png' : 'saple-details-real-logo.png') });
    }
    await logos.close();
    console.log('PASS: successful secondary-provider loading, remote failure, invalid and absent websites.');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });
