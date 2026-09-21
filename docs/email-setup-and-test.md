# Email setup and delivery test

**Written for:** the Saple owner configuring password-reset email for a new
deployment.

Saple sends exactly one kind of email: a password-reset link. This page covers
how to configure SMTP, how to prove it actually delivers, and what the automated
tests do and do not show.

> **The automated tests do not prove that email reaches a mailbox.** They run
> against a mock transport. Real delivery is only confirmed when you run the
> diagnostic below and see the message arrive in an inbox you control. Until
> then, describe password recovery as "code-complete, delivery not yet
> verified".

---

## 1. Variables

Set these privately — in `backend/.env` locally, or in the Render dashboard for
a deployment. Never commit real values.

| Variable | Required | Meaning |
|----------|----------|---------|
| `SMTP_HOST` | yes | Your provider's SMTP server name |
| `SMTP_PORT` | no, default `587` | `587` for STARTTLS, `465` for implicit TLS |
| `SMTP_SECURE` | no, default `false` | `true` only with port `465` |
| `SMTP_USER` | yes | The SMTP login |
| `SMTP_PASS` | yes | The SMTP password or app password |
| `SMTP_FROM` | yes | The visible sender, for example `Saple <no-reply@your-domain>` |
| `FRONTEND_URL` | yes, except on Render | The public origin reset links point at, for example `https://your-new-service.onrender.com` |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | no, default `15` | Link lifetime, 1–1440 |

`FRONTEND_URL` must be a plain `http` or `https` URL with no username or
password in it; anything else disables password recovery with a controlled
`503` rather than sending a broken or unsafe link. On Render, if `FRONTEND_URL`
is unset, the service's own `RENDER_EXTERNAL_URL` is used instead.

If SMTP is not configured at all, only password recovery stops working. The
forgot-password page reports that recovery is unavailable; every other part of
the site keeps running.

---

## 2. Example: Gmail with an App Password

Gmail refuses your normal account password over SMTP. Use an App Password,
which requires 2-Step Verification on the Google account.

1. Sign in to the Google account that will send the mail.
2. Turn on 2-Step Verification if it is not already on.
3. Open **Google Account → Security → App passwords**, create one named
   `Saple`, and copy the 16-character value. It is shown once.
4. Set:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=the-sending-address@gmail.com
SMTP_PASS=the-16-character-app-password
SMTP_FROM=Saple <the-sending-address@gmail.com>
```

Gmail rewrites the sender to the authenticated account, so `SMTP_FROM` should
use that same address. Personal Gmail accounts have daily sending limits; that
is ample for a course demonstration and unsuitable for anything larger.

## 3. Example: any other SMTP provider

Every transactional provider (Brevo, Mailgun, SendGrid, Amazon SES, a
university relay, and so on) publishes the same four facts. Look them up in the
provider's dashboard:

```
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=the-login-your-provider-gives-you
SMTP_PASS=the-smtp-key-your-provider-gives-you
SMTP_FROM=Saple <no-reply@a-domain-you-have-verified-with-that-provider>
```

Most providers require you to verify the sending domain or address before they
accept mail from it. Do that first, or every attempt fails with a sender
rejection.

---

## 4. Run the diagnostic

From `backend/`, with the variables in `backend/.env`:

```
npm run diagnose:smtp -- an-address-you-control@example.com
```

The command:

- sends **one** plain message, containing no link, no token and no account
  data, to the address you name — there is no default recipient, so it sends
  nothing unless you pass one;
- reads only `backend/.env`;
- prints `ACCEPTED` or `FAILED (<category>)` with a one-line fix, and never the
  password, the username or the provider's raw error text;
- exits `0` on acceptance and `1` on failure, so it can run in a script.

| Result | What to check |
|--------|---------------|
| `FAILED (CONFIG)` | The listed variable names are missing or malformed |
| `FAILED (EAUTH)` | Wrong login or password; for Gmail, use an App Password |
| `FAILED (ECONNECTION)` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` |
| `FAILED (ETIMEDOUT)` | Host or port, or a network that blocks outbound SMTP |
| `FAILED (ESOCKET)` | TLS mismatch: port `465` needs `SMTP_SECURE=true`, `587` needs `false` |
| `FAILED (EENVELOPE)` | The provider refused the sender or recipient; verify the sender |

**`ACCEPTED` means the server took the message, not that it arrived.** Open the
inbox. If it is not there within a few minutes, check the spam or junk folder.
Only after you have seen it arrive can delivery be called verified.

---

## 5. Test the real reset flow

Once the diagnostic arrives:

1. Open the deployed site's `forgot-password.html` and enter the email address
   of a test account you created.
2. The page says a link is on its way. It says the same thing for an address
   with no account, by design.
3. Open the email. Check that it names Saple as an independent BUET CSE
   academic project, states the expiry, and that the link points at your own
   deployment's origin.
4. Open the link. The address bar should drop the token immediately.
5. Set a new password. You should be signed out of any other session.
6. Open the same link again. It must be refused as already used.

---

## 6. What the automated tests cover

`backend/tests/password-reset.*.test.js`, `mail.service.test.js`,
`smtp-diagnostic.test.js` and `abuse-and-reset-safety.test.js` check, against a
mock transport:

- only a SHA-256 hash of the token is stored; the raw token is never returned
  or logged;
- an unknown, deactivated or real address all receive the same answer;
- an SMTP failure rolls back the token it would have issued;
- expired, used and revoked tokens are refused;
- a reset replaces the password, consumes the token and bumps the session
  version in one transaction;
- reset links are built only from a validated `FRONTEND_URL`;
- the email states its origin, expiry, single use and what to do if unrequested;
- the diagnostic never prints a secret and refuses to run without a recipient.

None of that proves a provider will accept, route or deliver the message. Only
step 4 above does.

---

## 7. Limits worth stating

- Forgot-password and reset are rate-limited per address and email. The limiter
  lives in process memory, so it resets when the service restarts and is not
  shared between instances. That is adequate for a single free-tier instance
  and not for a scaled deployment.
- If SMTP is misconfigured, a *real* account's request fails with a visible
  `503` while an unknown address still receives the generic answer. That
  difference is deliberate — the account holder needs to know the email is not
  coming — and it only exists while delivery is broken.
