const aiConfig = require('../config/ai');
const knowledge = require('./ai-knowledge');
const createHttpError = require('../utils/httpError');

const MAX_MESSAGE_LENGTH = 500;
const MAX_TURNS = 8;
const MAX_ANSWER_LENGTH = 1200;

// Requests that must never reach a provider, because answering them would be
// a privacy or safety problem regardless of what a model would have said.
const REFUSAL_PATTERNS = Object.freeze([
  {
    id: 'CREDENTIALS',
    pattern: /\b(api[\s_-]?key|secret|password|jwt|token|credential|database[_ -]?url|connection string|service role key|env(?:ironment)? (?:variable|file))\b/i,
    reply: 'I cannot share or collect credentials, keys or tokens. Saple never asks for them in chat. If you need to change your password, open your profile page, or use the Forgot password link on the sign-in page.'
  },
  {
    id: 'SYSTEM_PROMPT',
    pattern: /\b(system prompt|your instructions|initial prompt|ignore (?:all )?(?:your |previous |prior |above )*instructions|prompt injection|developer message)\b/i,
    reply: 'I can only help with using the Saple website. Ask me about companies, salary ranges, verification, jobs, applications, notifications or your account settings.'
  },
  {
    id: 'PRIVATE_DATA',
    pattern: /\b(who (?:wrote|submitted|posted)|real name of|identify the (?:reviewer|submitter|applicant)|personal (?:details|data) of|email address of|phone number of|list (?:all )?(?:users|accounts|applicants))\b/i,
    reply: 'I cannot see accounts, private submissions or applications, and Saple keeps contributor identity private when a contribution is anonymous. I can explain how verification and moderation work instead.'
  },
  {
    id: 'ACT_FOR_USER',
    pattern: /\b(apply (?:for|to) (?:this|that|the) job for me|submit (?:my|this) (?:application|review|salary) for me|delete my account now|approve (?:my|this)|change my password to)\b/i,
    reply: 'I cannot make changes on your behalf. I can tell you which page to use: Jobs for vacancies, My applications for your applications, and your profile page for account settings.'
  },
  {
    id: 'HARMFUL',
    pattern: /\b(hack|exploit|bypass (?:the )?(?:login|verification|auth)|fake (?:review|verification)|scrape (?:the )?(?:site|database)|ddos|sql injection)\b/i,
    reply: 'I cannot help with that. Saple is an academic project with a strict moderation and verification process, and I can only help you use the site as intended.'
  }
]);

// Anything that looks like a personal identifier is removed before a message
// leaves the server, even though the frontend is told not to send them.
function redactSensitiveText(value) {
  return String(value)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[hidden address]')
    .replace(/\b(?:\+?\d[\d\s-]{8,}\d)\b/g, '[hidden digits]')
    .replace(/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[hidden value]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[hidden value]');
}

// Plain text out, always. Control characters, markup and over-long answers are
// all cut here so the browser only ever receives text it can render with
// textContent.
function sanitizeAnswer(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > MAX_ANSWER_LENGTH ? `${text.slice(0, MAX_ANSWER_LENGTH).trimEnd()}…` : text;
}

function parseConversation(input = {}) {
  const rawMessages = Array.isArray(input.messages) ? input.messages : null;
  if (!rawMessages || rawMessages.length === 0) {
    throw createHttpError(400, 'A message is required');
  }
  if (rawMessages.length > MAX_TURNS) {
    throw createHttpError(400, `A conversation may contain at most ${MAX_TURNS} messages`);
  }

  const messages = rawMessages.map((message, index) => {
    const role = message?.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof message?.content === 'string' ? message.content.trim() : '';

    if (!content) throw createHttpError(400, 'Every message must contain text');
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw createHttpError(400, `Each message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    }
    if (index === rawMessages.length - 1 && role !== 'user') {
      throw createHttpError(400, 'The last message must come from you');
    }
    return { role, content: redactSensitiveText(content) };
  });

  return messages;
}

function findRefusal(message) {
  return REFUSAL_PATTERNS.find((rule) => rule.pattern.test(message)) || null;
}

function fallbackResponse(latestMessage, reason) {
  return {
    answer: knowledge.buildFallbackAnswer(latestMessage),
    source: 'FALLBACK',
    reason
  };
}

// One fixed provider URL from configuration, one fixed path, one fixed shape.
// Nothing here is influenced by the request beyond the message text itself.
async function callProvider(config, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: config.maxOutputTokens,
        messages: [
          { role: 'system', content: knowledge.buildSystemPrompt() },
          ...messages
        ]
      })
    });

    if (!response.ok) {
      const providerError = new Error(`AI provider responded with status ${response.status}`);
      providerError.sapleCode = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
      throw providerError;
    }

    const body = await response.json();
    const answer = sanitizeAnswer(body?.choices?.[0]?.message?.content);
    if (!answer) {
      const emptyError = new Error('AI provider returned an empty answer');
      emptyError.sapleCode = 'AI_PROVIDER_ERROR';
      throw emptyError;
    }
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

async function ask(input = {}) {
  const messages = parseConversation(input);
  const latest = messages[messages.length - 1].content;

  // Scope is judged on the original wording. Redaction happens first so that
  // nothing sensitive can leave, but a placeholder must not be able to turn an
  // ordinary question into a refusal, or a refusable one into an answer.
  const rawLatest = String(
    (Array.isArray(input.messages) ? input.messages[input.messages.length - 1]?.content : '') || latest
  );
  const refusal = findRefusal(rawLatest) || findRefusal(latest);
  if (refusal) {
    return { answer: refusal.reply, source: 'POLICY', reason: refusal.id };
  }

  let config;
  try {
    config = aiConfig.getAiConfig();
  } catch (error) {
    // A misconfigured provider must not break the guide or the site.
    return fallbackResponse(latest, 'NOT_CONFIGURED');
  }

  if (!config) return fallbackResponse(latest, 'DISABLED');

  try {
    return { answer: await callProvider(config, messages), source: 'AI', reason: null };
  } catch (error) {
    // Provider failures are never surfaced verbatim: the message could contain
    // request details, and none of it helps the reader.
    const reason = error.name === 'AbortError'
      ? 'TIMEOUT'
      : error.sapleCode || 'AI_PROVIDER_ERROR';
    console.warn(`Saple Guide provider unavailable (${reason}).`);
    return fallbackResponse(latest, reason);
  }
}

function getStatus() {
  return {
    ...aiConfig.getPublicStatus(),
    label: 'Saple Guide (AI-assisted)',
    privacyNotice: [
      'Messages you type here are sent to the AI provider configured by the site owner.',
      'Do not enter passwords, reset links, verification codes or personal details.',
      'The guide cannot see your account, your submissions or your applications.'
    ].join(' '),
    suggestedQuestions: knowledge.SUGGESTED_QUESTIONS,
    maxMessageLength: MAX_MESSAGE_LENGTH,
    maxTurns: MAX_TURNS
  };
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_TURNS,
  MAX_ANSWER_LENGTH,
  REFUSAL_PATTERNS,
  redactSensitiveText,
  sanitizeAnswer,
  parseConversation,
  findRefusal,
  ask,
  getStatus
};
