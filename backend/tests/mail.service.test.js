const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const mailConfig = require('../config/mail');
const mailService = require('../services/mail.service');

const originalCreateTransport = nodemailer.createTransport;
const originalInfo = console.info;
const environmentNames = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'FRONTEND_URL', 'PASSWORD_RESET_TOKEN_TTL_MINUTES'
];
const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));

test.beforeEach(() => {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-password',
    SMTP_FROM: 'Saple <no-reply@example.test>',
    FRONTEND_URL: 'http://localhost:5500',
    PASSWORD_RESET_TOKEN_TTL_MINUTES: '15'
  });
});

test.afterEach(() => {
  nodemailer.createTransport = originalCreateTransport;
  console.info = originalInfo;
  environmentNames.forEach((name) => {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  });
});

test('mail configuration parses typed SMTP and reset values', () => {
  assert.deepEqual(mailConfig.getSmtpConfig(), {
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    user: 'smtp-user',
    pass: 'smtp-password',
    from: 'Saple <no-reply@example.test>'
  });
  assert.equal(mailConfig.getPasswordResetTokenTtlMinutes(), 15);
  assert.equal(mailConfig.getFrontendUrl(), 'http://localhost:5500/');

  process.env.SMTP_SECURE = 'yes';
  assert.throws(() => mailConfig.getSmtpConfig(), /must be true or false/);
  process.env.SMTP_SECURE = 'false';
  process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES = '0';
  assert.throws(() => mailConfig.getPasswordResetTokenTtlMinutes(), /1 to 1440/);
});

test('mail service sends text and HTML without logging credentials or the raw reset token', async () => {
  const rawToken = 'raw-token-must-not-be-logged';
  const resetUrl = `http://localhost:5500/reset-password.html?token=${rawToken}`;
  let transportOptions;
  let message;
  let closed = false;
  const logs = [];

  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      sendMail: async (input) => { message = input; },
      close: () => { closed = true; }
    };
  };
  console.info = (...values) => { logs.push(values.join(' ')); };

  await mailService.sendPasswordResetEmail({
    recipientName: 'Test <Person>',
    recipientEmail: 'person@example.test',
    resetUrl,
    expiresMinutes: 15
  });

  assert.equal(transportOptions.port, 587);
  assert.equal(transportOptions.secure, false);
  assert.equal(transportOptions.auth.pass, 'smtp-password');
  assert.match(message.text, /Reset|reset/);
  assert.match(message.text, new RegExp(rawToken));
  assert.match(message.html, /single-use|only once/);
  assert.match(message.html, /Test &lt;Person&gt;/);
  assert.equal(closed, true);
  assert.equal(logs.join(' ').includes(rawToken), false);
  assert.equal(logs.join(' ').includes('smtp-password'), false);
});
