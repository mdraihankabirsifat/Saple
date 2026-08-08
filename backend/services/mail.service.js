const nodemailer = require('nodemailer');
const mailConfig = require('../config/mail');

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

async function sendPasswordResetEmail({ recipientName, recipientEmail, resetUrl, expiresMinutes }) {
  const smtp = mailConfig.getSmtpConfig();
  const transport = nodemailer.createTransport({
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
  const safeName = escapeHtml(recipientName || 'Saple user');
  const safeUrl = escapeHtml(resetUrl);

  try {
    await transport.sendMail({
      from: smtp.from,
      to: recipientEmail,
      subject: 'Reset your Saple password',
      text: [
        `Hello ${recipientName || 'Saple user'},`,
        '',
        'A password reset was requested for your Saple account.',
        `Open this temporary link within ${expiresMinutes} minutes:`,
        resetUrl,
        '',
        'If you did not request this change, you can ignore this email. Your existing password has not been sent or changed.'
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d2924;max-width:600px">
          <h1 style="color:#123c2d;font-size:24px">Reset your Saple password</h1>
          <p>Hello ${safeName},</p>
          <p>A password reset was requested for your Saple account.</p>
          <p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;background:#1f6b4d;text-decoration:none;font-weight:700">Choose a new password</a></p>
          <p>This link expires in ${expiresMinutes} minutes and can be used only once.</p>
          <p>If you did not request this change, ignore this email. Saple never sends your existing password.</p>
        </div>
      `
    });
    console.info('Password-reset email accepted by the configured SMTP service.');
  } finally {
    if (typeof transport.close === 'function') transport.close();
  }
}

module.exports = {
  sendPasswordResetEmail
};
