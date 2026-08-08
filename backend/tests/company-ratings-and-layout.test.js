const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const database = require('../config/database');
const companyRepository = require('../repositories/company.repository');

const projectRoot = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

test('company list and detail queries aggregate approved review ratings without N+1 requests', async () => {
  const calls = [];
  database.getConnection = async () => ({
    execute: async (sql, binds) => {
      calls.push({ sql, binds });
      return { rows: [] };
    },
    close: async () => {}
  });
  await companyRepository.findAllCompanies({
    search: '', industry: '', location: '', companySize: '', roleId: null,
    minSalary: null, maxSalary: null, hasSalaryData: false, minRating: null,
    hasReviews: false, hasInterviews: false, salarySource: 'COMMUNITY'
  });
  await companyRepository.findCompanyById(1);

  assert.equal(calls.length, 2);
  calls.forEach(({ sql }) => {
    assert.match(sql, /ROUND\(AVG\(cr\.overall_rating\), 1\)/i);
    assert.match(sql, /s\.submission_status = 'APPROVED'/i);
    assert.match(sql, /LEFT JOIN[\s\S]*review_stats/i);
    assert.match(sql, /"reviewCount"/);
    assert.match(sql, /"averageRating"/);
  });
});

test('company cards and detail header place accessible rating text beside the name', () => {
  const listScript = read('frontend/js/companies.js');
  const detailScript = read('frontend/js/company-details.js');
  for (const source of [listScript, detailScript]) {
    assert.match(source, /company-heading-line/);
    assert.match(source, /company-rating/);
    assert.match(source, /No rating yet/);
    assert.match(source, /toFixed\(1\)/);
    assert.match(source, /reviewCount/);
  }
});

test('salary, review, and interview pages use a responsive sidebar browse layout', () => {
  for (const filename of ['salaries.html', 'reviews.html', 'interviews.html']) {
    const html = read(`frontend/${filename}`);
    assert.match(html, /class="browse-layout"/);
    assert.match(html, /class="filter-panel card" aria-label=/);
    assert.match(html, /class="browse-results-column"/);
  }
  const css = read('frontend/css/browse.css');
  assert.match(css, /grid-template-columns: minmax\(220px, 270px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.filter-panel \{[\s\S]*position: sticky/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.browse-layout \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.filter-grid[^\n]*grid-template-columns: 1fr/);
});
