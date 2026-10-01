const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '../../frontend');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');

const SCRIPTS = ['js/premium.js', 'js/payment-result.js', 'js/premium-ui.js', 'js/profile-premium.js', 'js/admin-premium.js', 'js/resume-generator.js'];

test('the Premium pages follow the strict Content-Security-Policy', () => {
  for (const page of ['premium.html', 'payment-result.html', 'resume-generator.html']) {
    const html = read(page);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${page} has an inline script`);
    assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i, `${page} has inline style or handlers`);
    assert.match(html, /css\/premium-subscription\.css/);
  }
  for (const file of SCRIPTS) {
    const source = read(file);
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, file);
  }
});

test('the Premium page states the prepaid terms, the trial rules and the payment processor', () => {
  const html = read('premium.html');
  const script = read('js/premium.js');
  assert.match(html, /Prepaid access · no automatic renewal/);
  assert.match(html, /Try all Premium features free for 24 hours/);
  assert.match(html, /No card required/);
  assert.match(html, /Once per account/);
  assert.match(html, /Your 24-hour trial starts immediately and cannot be restarted\./);
  assert.match(html, /Payments are processed through SSLCommerz\./);
  assert.match(html, /Promo or referral code/);
  assert.doesNotMatch(html, /PCI/i);
  assert.match(script, /Free trial already used/);
  assert.match(script, /Save \$\{taka\(plan\.savingBdt\)\}/);
  // Prices shown come from the server's quote, and the gateway page must be HTTPS.
  assert.match(script, /\/api\/premium\/quote/);
  assert.match(script, /target\.protocol !== 'https:'/);
  // The comparison reflects free resume generation and Premium PDF export.
  for (const row of ['Saple Guide</th><td>Standard</td><td>Advanced</td>', 'Resume generation', 'Copy generated resume',
    'Official PDF resume download', 'Full interview questions', 'Premium jobs', 'Recruiter profile boost',
    'Premium badge', 'Viewer identities']) {
    assert.ok(html.includes(row), row);
  }
  assert.match(html, /<tr><th scope="row">Resume generation<\/th><td><span aria-hidden="true">✓/);
  assert.match(html, /<tr><th scope="row">Official PDF resume download<\/th><td><span aria-hidden="true">—/);
  assert.doesNotMatch(html, /Resume Generator is Premium-only/i);
});

test('the Premium page embeds no tools: the Guide upgrades itself and resumes have their own page', () => {
  const html = read('premium.html');
  const script = read('js/premium.js');
  assert.doesNotMatch(html, /id="(premium-tools|ai-form|ai-input|ai-transcript|resume-form|resume-text|resume-output)"/);
  assert.doesNotMatch(script, /\/api\/premium\/(ai|resume)\//);
  assert.match(html, /href="resume-generator\.html"/);
  assert.match(html, /id="open-guide"/);
  assert.match(script, /assistant\.openSharedView\('guide'\)/);
});

test('the resume generator is for every signed-in member, with Premium-only PDF export', () => {
  const html = read('resume-generator.html');
  const script = read('js/resume-generator.js');
  assert.match(html, /<h1 id="resume-title">Resume Generator<\/h1>/);
  assert.match(html, /Turn your experience into a clean resume\./);
  assert.match(html, /Saple does not invent experience, education, skills, dates or achievements\./);
  assert.match(html, /Resume text is sent to the configured AI provider to generate the result\./);
  assert.match(html, /PDF download is available with Saple Premium\./);
  assert.match(html, /href="premium\.html">Upgrade to Premium/);
  assert.match(html, /Copy resume/);
  assert.match(script, /apiRequest\('\/api\/resume\/generate'/);
  assert.match(script, /\/api\/resume\/pdf/);
  // Signed-out visitors are asked to sign in; the PDF stays visible but locked.
  assert.match(script, /if \(!isAuthenticated\(\)\) \{\n    nodes\.gate\.hidden = false;/);
  assert.match(script, /nodes\.pdf\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(read('js/nav.js'), /menuLink\('resume-generator\.html', 'Resume Generator'\)/);
  assert.match(read('js/assistant.js'), /auth: 'optional'/);
});

test('the payment result page polls a bounded number of times and trusts only the server', () => {
  const script = read('js/payment-result.js');
  assert.match(script, /const POLL_DELAYS_MS = \[[\d, ]+\];/);
  assert.match(script, /for \(let attempt = 0; attempt <= POLL_DELAYS_MS\.length; attempt \+= 1\)/);
  assert.match(script, /\/api\/premium\/payments\//);
  assert.match(script, /payment\?\.status === 'SUCCEEDED'/);
  assert.match(script, /Still confirming your payment/);
  assert.doesNotMatch(script, /setInterval/);
});

test('locked content is rendered from the API flags, and the teaser keeps its lock', () => {
  assert.match(read('js/interviews.js'), /item\.questionsLocked/);
  assert.match(read('js/company-details.js'), /item\.questionsLocked/);
  assert.match(read('js/premium-ui.js'), /Unlock full interview questions with Premium/);
  assert.match(read('js/jobs.js'), /job\.locked === true/);
  assert.match(read('js/job-details.js'), /error\.code === 'PREMIUM_REQUIRED'/);
  assert.match(read('js/api.js'), /options\.auth === 'optional'/);
});
