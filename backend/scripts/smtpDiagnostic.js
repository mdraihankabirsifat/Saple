// Owner-run SMTP check.
//
//   npm run diagnose:smtp -- you@example.com
//
// Sends one plain test message to the address given on the command line, using
// the SMTP_* settings from backend/.env. It prints a result category only:
// never the SMTP password, never a reset link and never a token. There is no
// default recipient, so it cannot send anything unless you name an address.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const mailService = require('../services/mail.service');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nodemailer error codes mapped to advice that names the setting to check and
// never repeats a value.
const FAILURES = Object.freeze({
  CONFIG: 'SMTP is not fully configured. Missing or invalid variable names are listed above.',
  EAUTH: 'The SMTP server rejected the username or password. For Gmail, use an App Password, not the account password.',
  ECONNECTION: 'Could not connect to the SMTP server. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE.',
  ETIMEDOUT: 'The SMTP server did not answer in time. Check SMTP_HOST and SMTP_PORT, and whether this network blocks outbound mail.',
  ESOCKET: 'The connection to the SMTP server failed. A TLS mismatch is common: port 465 needs SMTP_SECURE=true, port 587 needs SMTP_SECURE=false.',
  EENVELOPE: 'The SMTP server refused the sender or recipient address. Check SMTP_FROM and the address you passed.',
  EMESSAGE: 'The SMTP server refused the message.',
  UNKNOWN: 'Delivery failed for an unrecognised reason. Check the provider dashboard for rejected messages.'
});

function categorize(error) {
  if (/Missing required SMTP configuration|must be (true or false|an integer)/.test(error?.message || '')) {
    return 'CONFIG';
  }
  return FAILURES[error?.code] ? error.code : 'UNKNOWN';
}

async function main(argv = process.argv.slice(2)) {
  const recipient = String(argv[0] || '').trim();

  if (!recipient || !EMAIL_PATTERN.test(recipient) || recipient.length > 254) {
    console.error('Usage: npm run diagnose:smtp -- <address-you-control>');
    console.error('An explicit recipient address is required. Nothing was sent.');
    return 2;
  }

  console.log('Sending one Saple SMTP diagnostic message...');

  try {
    const result = await mailService.sendDiagnosticEmail({ recipientEmail: recipient });

    if (result.accepted === 0) {
      console.error(`FAILED (EENVELOPE): ${FAILURES.EENVELOPE}`);
      return 1;
    }

    console.log('ACCEPTED: the SMTP server accepted the message for delivery.');
    console.log('Accepted by the server does not mean delivered. Check the inbox and the spam folder.');
    return 0;
  } catch (error) {
    const category = categorize(error);
    // For configuration errors the message lists variable names only, which is
    // safe and useful. Every other error message is withheld: provider errors
    // can echo account details back.
    if (category === 'CONFIG') console.error(error.message);
    console.error(`FAILED (${category}): ${FAILURES[category]}`);
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}

module.exports = { main, categorize, FAILURES };
