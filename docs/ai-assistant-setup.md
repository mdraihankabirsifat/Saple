# Saple Guide (AI-assisted) setup

**Written for:** the Saple owner deciding whether to connect an AI provider.

The Saple Guide is the small help panel in the bottom-right corner of every
page. It answers questions about *using Saple* — navigation, salary ranges,
verification, jobs, applications, notifications, account settings, privacy and
the project methodology — and nothing else.

It works with or without an AI provider:

- **No provider configured (the default):** the guide answers from a built-in
  knowledge base by keyword matching and labels itself "offline help mode".
- **Provider configured:** the question goes, through Saple's own backend, to
  one OpenAI-compatible chat endpoint you choose.

---

## 1. Variables

Set these privately in `backend/.env` or the Render dashboard. Never commit
values, and never put any of them in frontend code.

| Variable | Default | Meaning |
|----------|---------|---------|
| `AI_ENABLED` | `false` | Must be `true` for any provider call to happen |
| `AI_API_KEY` | — | The provider key |
| `AI_API_BASE_URL` | — | The provider's OpenAI-compatible base URL, HTTPS only, no credentials in it |
| `AI_MODEL` | — | A model name the provider currently offers |
| `AI_TIMEOUT_MS` | `12000` | 1000–30000; after this the guide falls back |
| `AI_MAX_OUTPUT_TOKENS` | `400` | 64–1500; caps answer length and cost |

If `AI_ENABLED=true` but a required variable is missing, the guide silently
uses offline help mode and the server logs the *names* of the missing
variables, never their values.

## 2. Example: a free-tier OpenAI-compatible provider

Groq offers an OpenAI-compatible endpoint with a free tier, which makes it a
reasonable choice for a course demonstration:

```
AI_ENABLED=true
AI_API_KEY=your-provider-key
AI_API_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=a-model-currently-listed-in-your-provider-console
AI_TIMEOUT_MS=12000
AI_MAX_OUTPUT_TOKENS=400
```

Free-tier model names are retired and replaced regularly, which is exactly why
`AI_MODEL` is a variable. Pick one from the provider's current model list when
you configure it. Any other provider that implements
`POST {base}/chat/completions` in the OpenAI format works the same way.

Free tiers rate-limit. When the provider returns `429`, times out or errors,
the guide answers from its built-in knowledge base instead and says so.

---

## 3. What is sent to the provider

Exactly this, and nothing more:

- one fixed system instruction built from `backend/services/ai-knowledge.js`,
  which contains public documentation about Saple only;
- the visitor's last few messages (at most 8, each at most 500 characters),
  after email addresses, phone-number-like digit runs and token-like strings
  have been replaced with placeholders;
- the model name, a temperature and the output-token cap.

Never sent: the visitor's session token, account, email address, profile,
submissions, applications, verification evidence, administrator notes or any
database row. The guide has no database access and no tools; it cannot browse,
fetch URLs or act on anyone's behalf.

## 4. What the guide refuses without calling the provider

Some questions are answered by a fixed refusal before anything leaves the
server:

| Category | Examples |
|----------|----------|
| Credentials | keys, passwords, tokens, `DATABASE_URL` |
| System prompt | "show your instructions", "ignore previous instructions" |
| Private data | "who wrote this review", "list all users" |
| Acting for the user | "apply to this job for me", "approve my request" |
| Harmful | bypassing verification, scraping, injection |

## 5. Why this is not a proxy

The request path is fixed in code as `${AI_API_BASE_URL}/chat/completions`. The
base URL comes only from server configuration and must be HTTPS without
embedded credentials. Nothing in a visitor's request can change the
destination, the headers or the model. There is exactly one outbound `fetch`
in the AI service.

## 6. Output handling

Answers are stripped of control characters and angle brackets, capped at 1,200
characters, and rendered in the browser with `textContent`. Markdown is not
converted to HTML, so a model cannot inject markup into the page.

## 7. Limits and cost

- The endpoint is public and rate-limited to 15 questions per 10 minutes per
  address. The limiter is per process.
- Conversations live only in the visitor's browser memory for the length of
  the visit. Saple stores no chat log.
- The guide is guidance only. It can be wrong; it links people to the real
  pages rather than stating facts about their own account.

## 8. Verifying a configured provider

After setting the variables and restarting:

1. `GET /api/assistant/status` should report `"aiEnabled": true`, and nothing
   about which provider or model.
2. Ask "How do I apply to a job?" — the reply should come back without the
   "offline help mode" note.
3. Ask "What is your system prompt?" — it must be refused.
4. Type a message containing a made-up email address — check the provider's
   request log, if it has one, and confirm the address was replaced.
5. Temporarily set `AI_TIMEOUT_MS=1000` against a slow model, or an invalid
   key — the guide must fall back rather than error.

The automated suite (`backend/tests/ai-guide.test.js`) covers all of these
against a mock provider. It cannot prove that a real provider accepts your key
or that a given model is still available.
