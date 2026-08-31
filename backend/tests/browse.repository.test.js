const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const browseRepository = require('../repositories/browse.repository');

const originalQuery = database.query;

test.afterEach(() => {
  database.query = originalQuery;
});

test('public browse SQL enforces approved-only rows and binds every filter', async () => {
  const calls = [];
  database.query = async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  };

  await browseRepository.findPublicSalaryInsights({
    companyId: 4,
    roleId: 2,
    location: 'Dhaka',
    minSalary: 40000,
    maxSalary: 90000,
    salarySource: 'VERIFIED'
  });
  await browseRepository.findPublicReviews({
    companyId: 4,
    roleId: 2,
    location: 'Dhaka',
    minRating: 4
  });
  await browseRepository.findPublicInterviews({
    companyId: 4,
    roleId: 2,
    location: 'Dhaka',
    difficultyLevel: 'MEDIUM',
    interviewMode: 'ONLINE'
  });

  assert.equal(calls.length, 3);
  calls.forEach(({ sql, values }) => {
    assert.match(sql, /s\.submission_status = 'APPROVED'/);
    assert.match(sql, /\$1/);
    assert.match(sql, /\$2/);
    assert.match(sql, /\$3/);
    assert.deepEqual(values.slice(0, 3), [4, 2, '%DHAKA%']);
    assert.equal(sql.includes('40000'), false);
    assert.equal(sql.includes('90000'), false);
  });
  assert.deepEqual(calls[0].values, [4, 2, '%DHAKA%', 40000, 90000]);
  assert.deepEqual(calls[1].values, [4, 2, '%DHAKA%', 4]);
  assert.deepEqual(calls[2].values, [4, 2, '%DHAKA%', 'MEDIUM', 'ONLINE']);
});
