const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const discovery = require('../scripts/lib/logo-discovery');
const importer = require('../scripts/import-company-logos');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let popularity;
test.before(async () => {
  popularity = await import(pathToFileURL(path.join(ROOT, 'frontend/js/popularity.js')).href);
});

test('popular company and salary order favors activity, then stable IDs', () => {
  const companies = [
    { companyId: 3, companyName: 'C', reviewCount: 1 },
    { companyId: 2, companyName: 'B', reviewCount: 2 },
    { companyId: 1, companyName: 'A', reviewCount: 2 }
  ];
  assert.deepEqual(companies.sort(popularity.comparePopularCompanies()).map((row) => row.companyId), [1, 2, 3]);
  const salary = [
    { companyId: 3, roleId: 1, communityContributionCount: 1, verifiedContributionCount: 20 },
    { companyId: 2, roleId: 1, communityContributionCount: 4, verifiedContributionCount: 1 }
  ];
  assert.deepEqual(salary.sort(popularity.comparePopularSalaries).map((row) => row.companyId), [2, 3]);
  assert.equal(popularity.searchRelevance('Acme Labs', 'Acme Labs'), 3);
  assert.equal(popularity.searchRelevance('Acme Labs', 'Acme'), 2);
});

test('review and interview popularity uses group activity and recency', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  const items = [
    { submissionId: 1, companyId: 1, approvedAt: '2026-09-25T00:00:00Z' },
    { submissionId: 2, companyId: 2, approvedAt: '2026-09-20T00:00:00Z' },
    { submissionId: 3, companyId: 2, approvedAt: '2026-09-21T00:00:00Z' }
  ];
  const ordered = popularity.sortByPopularity(items, (item) => item.companyId, now);
  assert.deepEqual(ordered.slice(0, 2).map((row) => row.companyId), [2, 2]);
  assert.deepEqual(popularity.sortByPopularity(items, (item) => item.companyId, now), ordered);
});

test('job popularity is a deterministic server-side query over activity and age', () => {
  const source = read('backend/repositories/job.repository.js');
  assert.match(source, /COUNT\(\*\) FROM job_applications/);
  assert.match(source, /CURRENT_TIMESTAMP - published_at/);
  assert.match(source, /published_at DESC, job_id DESC/);
  assert.doesNotMatch(source, /ORDER BY RANDOM\(\)/i);
});

test('site links have no text underline rules and preserve focus visibility', () => {
  const files = fs.readdirSync(path.join(ROOT, 'frontend/css')).filter((name) => name.endsWith('.css'));
  for (const name of files) {
    const source = read(`frontend/css/${name}`);
    assert.doesNotMatch(source, /text-decoration\s*:\s*underline\b/i, name);
  }
  assert.match(read('frontend/css/common.css'), /a\s*\{[^}]*text-decoration:\s*none/s);
  assert.match(read('frontend/css/common.css'), /:focus-visible/);
});

test('logo discovery trusts the official page and rejects unrelated marks', () => {
  const html = `<title>Acme Labs</title>
    <script type="application/ld+json">{"@type":"Organization","logo":"/assets/acme-logo.svg"}</script>
    <header><img src="/assets/visa-logo.png"><img alt="Acme logo" src="/assets/header-logo.png"></header>
    <meta property="og:image" content="/assets/hero.jpg"><link rel="icon" sizes="256x256" href="/favicon.png">`;
  const candidates = discovery.extractCandidates(html, 'https://acme.com/', 'Acme Labs');
  assert.deepEqual(candidates.map((row) => row.method), ['JSONLD_ORGANIZATION_LOGO', 'HEADER_LOGO', 'SITE_ICON']);
  assert.ok(candidates.every((row) => !row.url.includes('visa')));
  assert.equal(discovery.normalizeWebsite('demo.example'), null);
  assert.equal(discovery.sniffImage(Buffer.from('<html>not an image</html>')), null);
  assert.equal(discovery.sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000" width="80" height="40"></svg>')), 'svg');
  assert.equal(importer.logoPathFor(27), 'companies/27/logo');
});

test('SVG logos are rasterized to WebP; dry runs never upload or update', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>');
  const webp = await importer.normalizeImage(sharp, svg, 'svg');
  assert.equal(discovery.sniffImage(webp), 'webp');
  let uploads = 0;
  let updates = 0;
  const fetch = async (url) => new Response(url.endsWith('.svg') ? svg : Buffer.from(`<title>Acme Labs</title><script type="application/ld+json">{"@type":"Organization","logo":"/logo.svg"}</script>`),
    { headers: { 'content-type': url.endsWith('.svg') ? 'image/svg+xml' : 'text/html' } });
  const result = await importer.processCompany({ companyId: 27, companyName: 'Acme Labs', website: 'https://acme.com' }, {
    fetch, sharp, dryRun: true, logoIsValid: async () => false,
    upload: async () => { uploads += 1; }, updateLogoPath: async () => { updates += 1; }
  });
  assert.equal(result.status, importer.STATUS.FOUND);
  assert.equal(uploads, 0);
  assert.equal(updates, 0);
});

test('a race with another logo keeps the other company choice', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>');
  let updated;
  const fetch = async (url) => new Response(url.endsWith('.svg') ? svg : Buffer.from(`<title>Acme Labs</title><script type="application/ld+json">{"@type":"Organization","logo":"/logo.svg"}</script>`),
    { headers: { 'content-type': url.endsWith('.svg') ? 'image/svg+xml' : 'text/html' } });
  const result = await importer.processCompany({ companyId: 27, companyName: 'Acme Labs', website: 'https://acme.com' }, {
    fetch, sharp, dryRun: false, logoIsValid: async () => false, upload: async () => {},
    updateLogoPath: async (...args) => { updated = args; return false; }
  });
  assert.deepEqual(updated, [27, 'companies/27/logo', null]);
  assert.equal(result.status, importer.STATUS.ALREADY_PRESENT);
});
