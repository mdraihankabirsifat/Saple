const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../config/database');
const browseRepository = require('../repositories/browse.repository');

const originalGetConnection = database.getConnection;

test.afterEach(() => {
  database.getConnection = originalGetConnection;
});

test('public browse SQL enforces approved-only rows and binds every filter', async () => {
  const calls = [];
  database.getConnection = async () => ({
    execute: async (sql, binds) => {
      calls.push({ sql, binds });
      return { rows: [] };
    },
    close: async () => {}
  });

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
  calls.forEach(({ sql, binds }) => {
    assert.match(sql, /s\.submission_status = 'APPROVED'/);
    assert.match(sql, /:companyId/);
    assert.match(sql, /:roleId/);
    assert.match(sql, /:locationPattern/);
    assert.equal(binds.companyId, 4);
    assert.equal(binds.roleId, 2);
    assert.equal(binds.locationPattern, '%DHAKA%');
    assert.equal(sql.includes('40000'), false);
    assert.equal(sql.includes('90000'), false);
  });
  assert.equal(calls[0].binds.minSalary, 40000);
  assert.equal(calls[0].binds.maxSalary, 90000);
  assert.equal(calls[1].binds.minRating, 4);
  assert.equal(calls[2].binds.difficultyLevel, 'MEDIUM');
  assert.equal(calls[2].binds.interviewMode, 'ONLINE');
});
