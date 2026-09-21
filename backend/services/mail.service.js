const nodemailer = require('nodemailer');
const mailConfig = require('../config/mail');

// Saple identifies itself the same way in email as on every page, and never
// dresses a message up as coming from a company, Google or any other brand.
const SITE_IDENTITY = 'Saple - an independent BUET CSE academic project for company and career insights.';
const SITE_DISCLAIMER = 'Saple is not affiliated with, endorsed by, or an official login service for any company listed on it.';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

// One transport per message, with file and URL access disabled so a message
// can never be made to attach a local file or fetch a remote resource.
function createTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}

function buildPasswordResetMessage({ recipientName, resetUrl, expiresMinutes }) {
  const name = recipientName || 'Saple user';
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const siteOrigin = (() => {
    try { return new URL(resetUrl).origin; } catch (error) { return ''; }
  })();
  const safeOrigin = escapeHtml(siteOrigin);

  const text = [
    `Hello ${name},`,
    '',
    'Someone asked to reset the password for the Saple account that uses this email address.',
    'If that was you, open this link to choose a new password:',
    '',
    resetUrl,
    '',
    `The link expires in ${expiresMinutes} minutes and works only once.`,
    'Using it signs you out of Saple on your other devices.',
    '',
    'If you did not ask for this, you do not need to do anything. Your password has not',
    'been changed, and Saple never sends your existing password by email.',
    '',
    'Before opening the link, check that it goes to the Saple site you normally use' + (siteOrigin ? ` (${siteOrigin}).` : '.'),
    'Saple will never ask for your password, a verification code or your company login by email.',
    '',
    '--',
    SITE_IDENTITY,
    SITE_DISCLAIMER
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1d2924;max-width:600px">
      <p style="margin:0 0 16px;font-size:13px;color:#617069">Saple &middot; independent BUET CSE academic project</p>
      <h1 style="margin:0 0 16px;color:#123c2d;font-size:22px">Reset your Saple password</h1>
      <p>Hello ${safeName},</p>
      <p>Someone asked to reset the password for the Saple account that uses this email address.
        If that was you, use the button below to choose a new password.</p>
      <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#ffffff;background:#1f6b4d;text-decoration:none;font-weight:700">Choose a new password</a></p>
      <p>This link expires in ${escapeHtml(expiresMinutes)} minutes and can be used only once. Using it signs you out of Saple on your other devices.</p>
      <p>If you did not ask for this, you do not need to do anything. Your password has not been changed, and Saple never sends your existing password by email.</p>
      <p style="font-size:14px;color:#617069">Before opening the link, check that it goes to the Saple site you normally use${safeOrigin ? ` (<span style="font-family:monospace">${safeOrigin}</span>)` : ''}.
        Saple will never ask for your password, a verification code or your company login by email.</p>
      <p style="font-size:14px;color:#617069">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${safeUrl}</span></p>
      <hr style="border:0;border-top:1px solid #d9e2dd;margin:24px 0">
      <p style="margin:0;font-size:12px;color:#617069">${escapeHtml(SITE_IDENTITY)}<br>${escapeHtml(SITE_DISCLAIMER)}</p>
    </div>
  `;

  return { subject: 'Reset your Saple password', text, html };
}

async function sendPasswordResetEmail({ recipientName, recipientEmail, resetUrl, expiresMinutes }) {
  const smtp = mailConfig.getSmtpConfig();
  const transport = createTransport(smtp);
  const message = buildPasswordResetMessage({ recipientName, resetUrl, expiresMinutes });

  try {
    await transport.sendMail({ from: smtp.from, to: recipientEmail, ...message });
    // Deliberately says nothing about the recipient, the link or the server.
    console.info('Password-reset email accepted by the configured SMTP service.');
  } finally {
    if (typeof transport.close === 'function') transport.close();
  }
}

// Used only by the owner-run diagnostic script. It sends a harmless message
// that contains no link, token or account data.
async function sendDiagnosticEmail({ recipientEmail }) {
  const smtp = mailConfig.getSmtpConfig();
  const transport = createTransport(smtp);

  try {
    if (typeof transport.verify === 'function') await transport.verify();
    const info = await transport.sendMail({
      from: smtp.from,
      to: recipientEmail,
      subject: 'Saple SMTP diagnostic',
      text: [
        'This is a test message from the Saple SMTP diagnostic command.',
        'If you can read it, the SMTP settings for this deployment can deliver mail.',
        '',
        'It contains no link, no token and no account information.',
        '',
        '--',
        SITE_IDENTITY,
        SITE_DISCLAIMER
      ].join('\n')
    });
    return {
      accepted: Array.isArray(info?.accepted) ? info.accepted.length : 0,
      rejected: Array.isArray(info?.rejected) ? info.rejected.length : 0
    };
  } finally {
    if (typeof transport.close === 'function') transport.close();
  }
}

module.exports = {
  SITE_IDENTITY,
  SITE_DISCLAIMER,
  buildPasswordResetMessage,
  sendPasswordResetEmail,
  sendDiagnosticEmail
};
