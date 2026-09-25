const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const aiService = require('../services/ai.service');

// The Saple Guide is an online feature with an honest offline state. These
// tests cover the successful provider call itself (shape, secrecy, scope) and
// the labels the panel shows, so built-in help can never be presented as if a
// model had written it.

const frontend = path.resolve(__dirname, '../../frontend');
const readFrontend = (file) => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/\r\n/g, '\n');

const AI_VARIABLES = ['AI_ENABLED', 'AI_API_KEY', 'AI_API_BASE_URL', 'AI_MODEL', 'AI_TIMEOUT_MS', 'AI_MAX_OUTPUT_TOKENS'];
const saved = {};
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

// A synthetic key: assembled at run time so no credential-shaped literal sits
// in this file.
const TEST_KEY = ['synthetic', 'groq', 'key', 'not', 'real'].join('-');

test.before(() => {
  for (const name of AI_VARIABLES) saved[name] = process.env[name];
});

test.beforeEach(() => {
  for (const name of AI_VARIABLES) delete process.env[name];
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

test.after(() => {
  for (const name of AI_VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

// Groq is the documented default, and its API is OpenAI-compatible.
function configureGroq({ model = 'llama-3.1-8b-instant' } = {}) {
  process.env.AI_ENABLED = 'true';
  process.env.AI_API_KEY = TEST_KEY;
  process.env.AI_API_BASE_URL = 'https://api.groq.com/openai/v1';
  process.env.AI_MODEL = model;
  process.env.AI_TIMEOUT_MS = '12000';
  process.env.AI_MAX_OUTPUT_TOKENS = '400';
}

function captureProvider(answer) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: answer } }] })
    };
  };
  return calls;
}

test('a successful answer is a server-side call to the configured provider', async () => {
  configureGroq();
  const calls = captureProvider('Verified ranges come from contributors verified for that exact company and role.');

  const result = await aiService.ask({ messages: [{ role: 'user', content: 'What is a verified salary range?' }] });

  assert.equal(result.source, 'AI');
  assert.equal(result.reason, null);
  assert.match(result.answer, /Verified ranges/);

  assert.equal(calls.length, 1);
  const [call] = calls;
  // One fixed endpoint, derived from configuration, never from the request.
  assert.equal(call.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.Authorization, `Bearer ${TEST_KEY}`);

  const body = JSON.parse(call.options.body);
  assert.equal(body.model, 'llama-3.1-8b-instant');
  assert.equal(body.max_tokens, 400);
  assert.ok(body.temperature <= 0.3, 'a low temperature keeps answers close to the documentation');
  // Exactly two messages travel: Saple's own documentation prompt, and what
  // the visitor typed. No account, database or request context is added.
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, require('../services/ai-knowledge').buildSystemPrompt());
  assert.deepEqual(body.messages[1], { role: 'user', content: 'What is a verified salary range?' });
  assert.doesNotMatch(call.options.body, /DATABASE_URL|applicant_user_id|password_hash|Bearer eyJ/i);
});

test('the model is whatever the owner configured, so a retired model needs no code change', async () => {
  configureGroq({ model: 'openai/gpt-oss-20b' });
  const calls = captureProvider('Answer.');

  await aiService.ask({ messages: [{ role: 'user', content: 'How do I apply to a job?' }] });

  assert.equal(JSON.parse(calls[0].options.body).model, 'openai/gpt-oss-20b');
});

test('a provider failure never writes the key, the URL or the body to the log', async () => {
  configureGroq();
  const logged = [];
  console.warn = (...values) => logged.push(values.join(' '));
  globalThis.fetch = async () => { throw Object.assign(new Error(`connect failed for ${TEST_KEY}`), { sapleCode: 'AI_PROVIDER_ERROR' }); };

  const result = await aiService.ask({ messages: [{ role: 'user', content: 'How does verification work?' }] });

  assert.equal(result.source, 'FALLBACK');
  assert.equal(result.reason, 'AI_PROVIDER_ERROR');
  const output = logged.join('\n');
  assert.equal(output.includes(TEST_KEY), false, 'the key must never be logged');
  assert.equal(output.includes('api.groq.com'), false, 'the provider URL must never be logged');
  assert.equal(result.answer.includes(TEST_KEY), false, 'the key must never reach the reader');
});

test('a malformed provider payload degrades to built-in help rather than throwing', async () => {
  for (const payload of [{}, { choices: null }, { choices: [{}] }, { choices: [{ message: { content: '   ' } }] }]) {
    configureGroq();
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload });

    const result = await aiService.ask({ messages: [{ role: 'user', content: 'How does verification work?' }] });
    assert.equal(result.source, 'FALLBACK', JSON.stringify(payload));
    assert.equal(result.reason, 'AI_PROVIDER_ERROR');
    assert.ok(result.answer.length > 0);
  }
});

test('provider markup is rendered as plain text, never as HTML', async () => {
  configureGroq();
  captureProvider('<script>alert(1)</script> Use the **Companies** page. <img src=x onerror=alert(1)>');

  const result = await aiService.ask({ messages: [{ role: 'user', content: 'Where do I find companies?' }] });

  // Angle brackets are stripped, so nothing the provider returns can become
  // markup, whatever the client did with it.
  assert.doesNotMatch(result.answer, /[<>]/);
  assert.match(result.answer, /Companies/);
  // The client also renders with textContent, so nothing can become markup.
  assert.match(readFrontend('js/assistant.js'), /\.textContent = result\.answer/);
  assert.doesNotMatch(readFrontend('js/assistant.js'), /innerHTML/);
});

// ---------------------------------------------------------------------------
// The panel tells the truth about where an answer came from
// ---------------------------------------------------------------------------

test('the panel labels each answer by its real source', () => {
  const client = readFrontend('js/assistant.js');

  assert.match(client, /AI: \{ text: 'AI-assisted'/);
  assert.match(client, /FALLBACK: \{ text: ['"]Built-in Saple help \(not AI\)['"]/);
  assert.match(client, /POLICY: \{ text: 'Saple safety rule'/);
  // The old wording presented built-in help as an "offline mode" of the AI.
  assert.doesNotMatch(client, /Offline help mode: answered from/);
});

test('every provider outage has an honest message, and transient ones offer a retry', () => {
  const client = readFrontend('js/assistant.js');
  const outages = client.slice(client.indexOf('const OUTAGE_REASONS'), client.indexOf('function setStatus'));

  for (const reason of ['DISABLED', 'NOT_CONFIGURED', 'TIMEOUT', 'AI_RATE_LIMITED', 'AI_PROVIDER_ERROR']) {
    assert.match(outages, new RegExp(`${reason}: \\{`), reason);
  }
  // Configuration problems are not retryable; transient failures are.
  assert.match(outages, /DISABLED: \{ message: '[^']+', retry: false \}/);
  assert.match(outages, /NOT_CONFIGURED: \{ message: '[^']+', retry: false \}/);
  assert.match(outages, /TIMEOUT: \{ message: '[^']+', retry: true \}/);
  assert.match(outages, /AI_RATE_LIMITED: \{ message: '[^']+', retry: true \}/);
  assert.match(client, /function retryButton\(question, message\)/);
});

test('the panel carries a live status indicator and disables Send while asking', () => {
  const client = readFrontend('js/assistant.js');
  const css = readFrontend('css/common.css');

  assert.match(client, /className: 'guide-status'[\s\S]{0,120}'aria-live': 'polite'/);
  assert.match(client, /setStatus\('working', 'Asking…'\)/);
  assert.match(client, /setStatus\('online', 'Online'\)/);
  assert.match(client, /sendButton\.disabled = true/);
  assert.match(client, /sendButton\.disabled = false/);

  // Styled for both themes through tokens, never a hard-coded colour.
  const pill = css.slice(css.indexOf('.guide-status {'), css.indexOf('.guide-source {'));
  assert.match(pill, /var\(--success\)/);
  assert.match(pill, /var\(--warning\)/);
  assert.doesNotMatch(pill, /#[0-9a-f]{3,6}/i);
});

test('the guide never blocks the rest of the site when the provider is down', () => {
  const client = readFrontend('js/assistant.js');

  // Mounting is best-effort: nav.js catches a failed import, and a failed
  // status call simply leaves the launcher out of the page.
  const nav = readFrontend('js/nav.js');
  const mount = nav.slice(nav.indexOf('import(assistantModuleUrl.href)'));
  assert.match(mount.slice(0, 200), /\.catch\(\(\) => \{\}\)/);
  const statusFailure = client.slice(client.indexOf('await fetchApi(\'/api/assistant/status\')'));
  assert.match(statusFailure.slice(0, 400), /catch \(error\) \{[\s\S]*?return;/);
});
