const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const mailService = require('../services/mail.service');
const diagnostic = require('../scripts/smtpDiagnostic');

const originalCreateTransport = nodemailer.createTransport;
const originalLog = console.log;
const originalError = console.error;
const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const savedEnvironment = Object.fromEntries(names.map((name) => [name, process.env[name]]));

let output;

test.beforeEach(() => {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'diagnostic-user',
    SMTP_PASS: 'diagnostic-password-must-never-print',
    SMTP_FROM: 'Saple <no-reply@example.test>'
  });
  output = [];
  console.log = (...values) => output.push(values.join(' '));
  console.error = (...values) => output.push(values.join(' '));
});

test.afterEach(() => {
  nodemailer.createTransport = originalCreateTransport;
  console.log = originalLog;
  console.error = originalError;
  for (const name of names) {
    if (savedEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnvironment[name];
  }
});

function fakeTransport(behaviour) {
  const sent = [];
  nodemailer.createTransport = () => ({
    verify: async () => behaviour.verify?.(),
    sendMail: async (message) => {
      sent.push(message);
      if (behaviour.send) return behaviour.send(message);
      return { accepted: [message.to], rejected: [] };
    },
    close: () => {}
  });
  return sent;
}

// ---------------------------------------------------------------------------
// The reset email itself
// ---------------------------------------------------------------------------

test('the reset email states who sent it, why, the expiry and single use', () => {
  const message = mailService.buildPasswordResetMessage({
    recipientName: 'Test Person',
    resetUrl: 'https://saple.example.test/reset-password.html?token=abc',
    expiresMinutes: 15
  });

  for (const part of [message.text, message.html]) {
    assert.match(part, /independent BUET CSE academic project/);
    assert.match(part, /not affiliated with, endorsed by, or an official login service/);
    assert.match(part, /15 minutes/);
    assert.match(part, /only once/);
    assert.match(part, /did not ask for this/);
    assert.match(part, /never sends your existing password/);
    assert.match(part, /never ask for your password, a verification code or your company login/);
    assert.match(part, /https:\/\/saple\.example\.test/);
  }
  assert.equal(message.subject, 'Reset your Saple password');

  // No third-party brand and no remote image anywhere in the message.
  assert.doesNotMatch(message.html, /<img|google|microsoft|gmail|outlook/i);
});

test('names and links are escaped in the HTML part', () => {
  const message = mailService.buildPasswordResetMessage({
    recipientName: '<script>alert(1)</script>',
    resetUrl: 'https://saple.example.test/reset-password.html?token=a"b',
    expiresMinutes: 15
  });

  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /token=a&quot;b/);
});

// ---------------------------------------------------------------------------
// The diagnostic command
// ---------------------------------------------------------------------------

test('the diagnostic refuses to run without an explicit recipient', async () => {
  let transports = 0;
  nodemailer.createTransport = () => { transports += 1; return {}; };

  for (const argv of [[], [''], ['not-an-address'], ['a@b']]) {
    assert.equal(await diagnostic.main(argv), 2, JSON.stringify(argv));
  }
  assert.equal(transports, 0, 'nothing was sent');
  assert.match(output.join('\n'), /An explicit recipient address is required/);
});

test('a successful send reports acceptance, not delivery, and prints no secret', async () => {
  const sent = fakeTransport({});

  assert.equal(await diagnostic.main(['owner@example.test']), 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.test');

  // The diagnostic message carries no link and no token.
  assert.doesNotMatch(sent[0].text, /https?:\/\/|token=/);
  assert.match(sent[0].text, /independent BUET CSE academic project/);

  const printed = output.join('\n');
  assert.match(printed, /ACCEPTED/);
  assert.match(printed, /Check the inbox and the spam folder/);
  assert.equal(printed.includes('diagnostic-password-must-never-print'), false);
  assert.equal(printed.includes('diagnostic-user'), false);
});

test('every failure becomes a category with advice, never the provider message', async () => {
  const cases = [
    ['EAUTH', /App Password/],
    ['ECONNECTION', /SMTP_HOST, SMTP_PORT and SMTP_SECURE/],
    ['ETIMEDOUT', /did not answer in time/],
    ['ESOCKET', /port 465 needs SMTP_SECURE=true/],
    ['EENVELOPE', /sender or recipient/],
    ['SOMETHING_NEW', /unrecognised reason/]
  ];

  for (const [code, advice] of cases) {
    output = [];
    fakeTransport({
      send: () => {
        const error = new Error(`535 auth failed for diagnostic-user with diagnostic-password-must-never-print (${code})`);
        error.code = code;
        throw error;
      }
    });

    assert.equal(await diagnostic.main(['owner@example.test']), 1, code);
    const printed = output.join('\n');
    assert.match(printed, advice, code);
    assert.equal(printed.includes('diagnostic-password-must-never-print'), false, code);
    assert.equal(printed.includes('diagnostic-user'), false, code);
  }
});

test('a rejected recipient is a failure even when no error is thrown', async () => {
  fakeTransport({ send: () => ({ accepted: [], rejected: ['owner@example.test'] }) });
  assert.equal(await diagnostic.main(['owner@example.test']), 1);
  assert.match(output.join('\n'), /FAILED \(EENVELOPE\)/);
});

test('missing configuration names the variables and nothing else', async () => {
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_HOST;

  assert.equal(await diagnostic.main(['owner@example.test']), 1);
  const printed = output.join('\n');
  assert.match(printed, /Missing required SMTP configuration: SMTP_HOST, SMTP_PASS/);
  assert.match(printed, /FAILED \(CONFIG\)/);
  assert.equal(printed.includes('diagnostic-user'), false);
});

test('the diagnostic is wired as an npm script and reads only backend/.env', () => {
  const pkg = require('../package.json');
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../scripts/smtpDiagnostic'), 'utf8');

  assert.equal(pkg.scripts['diagnose:smtp'], 'node scripts/smtpDiagnostic.js');
  assert.match(source, /path\.join\(__dirname, '\.\.', '\.env'\)/);
  // No default recipient exists anywhere in the script.
  assert.doesNotMatch(source, /argv\[0\] \|\| '[^']+@/);
});
