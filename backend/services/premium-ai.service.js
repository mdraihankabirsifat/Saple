// Premium AI: an advanced career conversation and a resume generator.
//
// It reuses the Saple Guide's provider settings (AI_API_BASE_URL, AI_API_KEY)
// with its own model, PREMIUM_AI_MODEL. When that model is not configured the
// Premium features answer "temporarily unavailable" and the free Saple Guide
// is unaffected. Prompts and resume text are sent to the provider to produce
// the answer and are not stored by Saple; only a usage count is kept.

const aiConfig = require('../config/ai');
const paymentConfig = require('../config/payment');
const premiumRepository = require('../repositories/premium.repository');
const createHttpError = require('../utils/httpError');

const MAX_CHAT_TURNS = 12;
const MAX_MESSAGE_CHARS = 2000;
const MAX_RESUME_CHARS = 10000;
const MIN_RESUME_CHARS = 40;

const CHAT_SYSTEM_PROMPT = [
  'You are Saple Advanced, a career assistant for members of Saple, a company and career insights site used mainly in Bangladesh.',
  'Help with career planning, job search strategy, interview preparation, salary negotiation, workplace questions and professional writing.',
  'Be practical and specific, and say when something depends on the person\'s situation.',
  'You do not have access to the member\'s account, applications, messages or any private Saple data, and you must not pretend to.',
  'Do not state salary figures or company facts as certain; suggest checking Saple\'s approved data and official sources.',
  'Never ask for passwords, payment details or national ID numbers.'
].join(' ');

const RESUME_SYSTEM_PROMPT = [
  'You turn a person\'s own notes into a clean resume.',
  'Use ONLY facts that appear in the text the user supplies.',
  'Never invent or embellish employers, job titles, schools, degrees, dates, achievements, certifications, skills, metrics, numbers or contact details.',
  'If a fact is missing, omit it; do not guess and do not write placeholders.',
  'You may rephrase the user\'s own statements more clearly and concisely.',
  'Reply with a single JSON object and nothing else, using exactly these keys:',
  '{"name": string|null, "headline": string|null, "summary": string|null, "skills": [string],',
  '"experience": [{"title": string|null, "organization": string|null, "location": string|null, "start": string|null, "end": string|null, "highlights": [string]}],',
  '"education": [{"institution": string|null, "degree": string|null, "field": string|null, "start": string|null, "end": string|null, "details": string|null}],',
  '"projects": [{"name": string|null, "description": string|null, "highlights": [string]}]}'
].join(' ');

function unavailable() {
  const error = createHttpError(503, 'Premium AI is temporarily unavailable. The free Saple Guide still works.');
  error.sapleCode = 'PREMIUM_AI_UNAVAILABLE';
  return error;
}

function premiumAiConfig() {
  let base;
  try {
    base = aiConfig.getAiConfig();
  } catch (error) {
    throw unavailable();
  }
  const model = process.env.PREMIUM_AI_MODEL?.trim();
  if (!base || !model || model.length > 120) throw unavailable();
  return { ...base, model };
}

function isAvailable() {
  try { return Boolean(premiumAiConfig()); } catch (error) { return false; }
}

function cleanText(value, maximum) {
  if (typeof value !== 'string') return null;
  // Strip control characters (keeping newlines and tabs) and markup brackets.
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
  return text ? text.slice(0, maximum) : null;
}

async function assertQuota(userId, featureType, limit) {
  const used = await premiumRepository.countAiUsageToday(userId, featureType);
  if (used >= limit) {
    const error = createHttpError(429, 'You have reached today\'s Premium AI limit. It resets at midnight (UTC).');
    error.sapleCode = 'PREMIUM_AI_LIMIT';
    throw error;
  }
}

async function callProvider(config, messages, maxTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(config.timeoutMs, 20000));
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: maxTokens, messages })
    });
  } catch (error) {
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    if (response.status === 429) {
      const error = createHttpError(429, 'Premium AI is busy right now. Please try again in a minute.');
      error.sapleCode = 'PREMIUM_AI_BUSY';
      throw error;
    }
    throw unavailable();
  }
  const body = await response.json().catch(() => null);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw unavailable();
  return {
    content,
    inputTokens: Number.isInteger(body?.usage?.prompt_tokens) ? body.usage.prompt_tokens : null,
    outputTokens: Number.isInteger(body?.usage?.completion_tokens) ? body.usage.completion_tokens : null
  };
}

function parseMessages(input) {
  const raw = Array.isArray(input.messages) ? input.messages
    : typeof input.message === 'string' ? [{ role: 'user', content: input.message }] : null;
  if (!raw || !raw.length) throw createHttpError(400, 'Write a message first.');
  const turns = raw.slice(-MAX_CHAT_TURNS).map((turn) => {
    if (!turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string') {
      throw createHttpError(400, 'Each message needs a role (user or assistant) and text.');
    }
    const content = cleanText(turn.content, MAX_MESSAGE_CHARS + 1);
    if (!content) throw createHttpError(400, 'Messages cannot be empty.');
    if (content.length > MAX_MESSAGE_CHARS) throw createHttpError(400, `Keep each message under ${MAX_MESSAGE_CHARS} characters.`);
    return { role: turn.role, content };
  });
  if (turns[turns.length - 1].role !== 'user') throw createHttpError(400, 'The last message must be yours.');
  return turns;
}

async function chat(userId, input = {}) {
  const config = premiumAiConfig();
  const messages = parseMessages(input);
  const { chatPerDay } = paymentConfig.getPremiumAiLimits();
  await assertQuota(userId, 'ADVANCED_CHAT', chatPerDay);
  const answer = await callProvider(config, [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...messages],
    Math.min(Math.max(config.maxOutputTokens, 600), 1200));
  await premiumRepository.recordAiUsage({
    userId, featureType: 'ADVANCED_CHAT', model: config.model,
    inputTokens: answer.inputTokens, outputTokens: answer.outputTokens
  });
  return { answer: cleanText(answer.content, 6000), source: 'PREMIUM_AI' };
}

// ---- Resume ----------------------------------------------------------------

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// A key fact survives only if it appears in the user's own text. The model is
// told not to invent anything; this makes the rule hold even when it does.
function grounded(source, value, maximum = 200) {
  const text = cleanText(value, maximum);
  if (!text) return null;
  const needle = normalizeForMatch(text);
  return needle && source.includes(needle) ? text : null;
}

function list(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function parseResumeJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (error) { return null; }
}

function shapeResume(raw, sourceText) {
  const source = normalizeForMatch(sourceText);
  const highlights = (items) => list(items, 8).map((item) => cleanText(item, 300)).filter(Boolean);
  const resume = {
    name: grounded(source, raw.name, 120),
    headline: cleanText(raw.headline, 160),
    summary: cleanText(raw.summary, 1200),
    skills: [...new Set(list(raw.skills, 30).map((skill) => grounded(source, skill, 60)).filter(Boolean))],
    experience: list(raw.experience, 15).map((item) => ({
      title: grounded(source, item?.title, 160),
      organization: grounded(source, item?.organization, 160),
      location: grounded(source, item?.location, 120),
      start: grounded(source, item?.start, 40),
      end: grounded(source, item?.end, 40),
      highlights: highlights(item?.highlights)
    })).filter((item) => item.title || item.organization),
    education: list(raw.education, 10).map((item) => ({
      institution: grounded(source, item?.institution, 160),
      degree: grounded(source, item?.degree, 120),
      field: grounded(source, item?.field, 120),
      start: grounded(source, item?.start, 40),
      end: grounded(source, item?.end, 40),
      details: cleanText(item?.details, 300)
    })).filter((item) => item.institution || item.degree),
    projects: list(raw.projects, 10).map((item) => ({
      name: grounded(source, item?.name, 160),
      description: cleanText(item?.description, 400),
      highlights: highlights(item?.highlights)
    })).filter((item) => item.name)
  };
  return resume;
}

async function generateResume(userId, input = {}) {
  const config = premiumAiConfig();
  const text = cleanText(input.text, MAX_RESUME_CHARS + 1);
  if (!text || text.length < MIN_RESUME_CHARS) {
    throw createHttpError(400, `Paste at least ${MIN_RESUME_CHARS} characters about your experience, education and skills.`);
  }
  if (text.length > MAX_RESUME_CHARS) throw createHttpError(400, `Keep the text under ${MAX_RESUME_CHARS} characters.`);
  const targetRole = input.targetRole === undefined || input.targetRole === null || input.targetRole === ''
    ? null : cleanText(input.targetRole, 121);
  if (targetRole && targetRole.length > 120) throw createHttpError(400, 'Keep the target role under 120 characters.');
  const style = input.style === 'concise' ? 'concise' : 'standard';

  const { resumePerDay } = paymentConfig.getPremiumAiLimits();
  await assertQuota(userId, 'RESUME_GENERATION', resumePerDay);

  const instructions = [
    `Style: ${style === 'concise' ? 'concise, one page, short bullet points' : 'standard, clear and complete'}.`,
    targetRole ? `Target role (use only to choose emphasis and ordering, never to add facts): ${targetRole}.` : '',
    'Source text follows between the markers.',
    '<<<SOURCE', text, 'SOURCE>>>'
  ].filter(Boolean).join('\n');

  const answer = await callProvider(config, [
    { role: 'system', content: RESUME_SYSTEM_PROMPT },
    { role: 'user', content: instructions }
  ], 1500);
  await premiumRepository.recordAiUsage({
    userId, featureType: 'RESUME_GENERATION', model: config.model,
    inputTokens: answer.inputTokens, outputTokens: answer.outputTokens
  });

  const raw = parseResumeJson(answer.content);
  if (!raw || typeof raw !== 'object') {
    const error = createHttpError(502, 'The resume could not be formatted this time. Please try again.');
    error.sapleCode = 'RESUME_FORMAT_FAILED';
    throw error;
  }
  return { resume: shapeResume(raw, text), style, targetRole };
}

module.exports = {
  CHAT_SYSTEM_PROMPT, RESUME_SYSTEM_PROMPT, MAX_RESUME_CHARS,
  isAvailable, chat, generateResume, shapeResume, parseResumeJson
};
