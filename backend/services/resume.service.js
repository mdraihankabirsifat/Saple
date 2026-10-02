const paymentConfig = require('../config/payment');
const premiumRepository = require('../repositories/premium.repository');
const premiumService = require('./premium.service');
const aiProvider = require('./ai-provider');
const createHttpError = require('../utils/httpError');
const { buildResumePdf } = require('../utils/resume-pdf');

// Resume generator.
//
// Every signed-in member can generate, read and copy a resume. Premium and
// trial members get a larger daily allowance and Saple's official PDF export.
// The pasted text is sent to the configured AI provider to produce the result
// and is not stored; only a usage count is kept for the daily allowance. Free
// output is not made worse on purpose: everyone gets the same model and rules.

const MAX_RESUME_CHARS = 10000;
const MIN_RESUME_CHARS = 40;

const RESUME_SYSTEM_PROMPT = [
  'You turn a person\'s own notes into a clean resume.',
  'Use ONLY facts that appear in the text the user supplies.',
  'Never invent or embellish employers, job titles, schools, degrees, dates, achievements, certifications, skills, metrics, numbers, projects or contact details.',
  'If a fact is missing, omit it; do not guess and do not write placeholders.',
  'You may rephrase the user\'s own statements more clearly and concisely.',
  'Reply with a single JSON object and nothing else, using exactly these keys:',
  '{"name": string|null, "headline": string|null, "summary": string|null, "skills": [string],',
  '"experience": [{"title": string|null, "organization": string|null, "location": string|null, "start": string|null, "end": string|null, "highlights": [string]}],',
  '"education": [{"institution": string|null, "degree": string|null, "field": string|null, "start": string|null, "end": string|null, "details": string|null}],',
  '"projects": [{"name": string|null, "description": string|null, "highlights": [string]}]}'
].join(' ');

function codedError(status, message, code) {
  const error = createHttpError(status, message);
  error.sapleCode = code;
  return error;
}

function unavailable() {
  return codedError(503, 'The resume generator is temporarily unavailable. Please try again later.', 'RESUME_UNAVAILABLE');
}

// One model for everyone: the Premium model when configured, else the
// standard one. The provider and key are the site owner's existing settings.
function resumeConfig() {
  const base = aiProvider.standardConfig();
  if (!base) return null;
  return aiProvider.premiumModelConfig(base) || base;
}

function isAvailable() {
  return Boolean(resumeConfig());
}

function cleanText(value, maximum) {
  if (typeof value !== 'string') return null;
  // Strip control characters (keeping newlines and tabs) and markup brackets.
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
  return text ? text.slice(0, maximum) : null;
}

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
  const trimmed = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(trimmed.slice(start, end + 1)); } catch (error) { return null; }
}

// The resume shape, with each value cleaned and bounded. With a source text,
// names, titles, organisations, places, dates, skills, schools, degrees and
// project names must also appear in that text.
function shapeResume(raw, sourceText = null) {
  const source = sourceText === null ? null : normalizeForMatch(sourceText);
  const fact = (value, maximum) => (source === null ? cleanText(value, maximum) : grounded(source, value, maximum));
  const highlights = (items) => list(items, 8).map((item) => cleanText(item, 300)).filter(Boolean);
  return {
    name: fact(raw?.name, 120),
    headline: cleanText(raw?.headline, 160),
    summary: cleanText(raw?.summary, 1200),
    skills: [...new Set(list(raw?.skills, 30).map((skill) => fact(skill, 60)).filter(Boolean))],
    experience: list(raw?.experience, 15).map((item) => ({
      title: fact(item?.title, 160),
      organization: fact(item?.organization, 160),
      location: fact(item?.location, 120),
      start: fact(item?.start, 40),
      end: fact(item?.end, 40),
      highlights: highlights(item?.highlights)
    })).filter((item) => item.title || item.organization),
    education: list(raw?.education, 10).map((item) => ({
      institution: fact(item?.institution, 160),
      degree: fact(item?.degree, 120),
      field: fact(item?.field, 120),
      start: fact(item?.start, 40),
      end: fact(item?.end, 40),
      details: cleanText(item?.details, 300)
    })).filter((item) => item.institution || item.degree),
    projects: list(raw?.projects, 10).map((item) => ({
      name: fact(item?.name, 160),
      description: cleanText(item?.description, 400),
      highlights: highlights(item?.highlights)
    })).filter((item) => item.name)
  };
}

async function allowanceFor(userId) {
  const premium = await premiumService.hasPremiumFeatureAccess(userId);
  const limits = paymentConfig.getPremiumAiLimits();
  const dailyLimit = premium ? limits.resumePerDay : limits.freeResumePerDay;
  const usedToday = await premiumRepository.countAiUsageToday(userId, 'RESUME_GENERATION');
  return { premium, dailyLimit, usedToday, remaining: Math.max(0, dailyLimit - usedToday) };
}

async function getStatus(userId) {
  const allowance = await allowanceFor(userId);
  return {
    available: isAvailable(),
    // PDF export follows the same server-side Premium check as /api/resume/pdf.
    pdfAvailable: allowance.premium,
    premium: allowance.premium,
    dailyLimit: allowance.dailyLimit,
    usedToday: allowance.usedToday,
    remaining: allowance.remaining
  };
}

async function generateResume(userId, input = {}) {
  const text = cleanText(input.text, MAX_RESUME_CHARS + 1);
  if (!text || text.length < MIN_RESUME_CHARS) {
    throw createHttpError(400, `Paste at least ${MIN_RESUME_CHARS} characters about your experience, education and skills.`);
  }
  if (text.length > MAX_RESUME_CHARS) throw createHttpError(400, `Keep the text under ${MAX_RESUME_CHARS} characters.`);
  const targetRole = input.targetRole === undefined || input.targetRole === null || input.targetRole === ''
    ? null : cleanText(input.targetRole, 121);
  if (targetRole && targetRole.length > 120) throw createHttpError(400, 'Keep the target role under 120 characters.');
  const style = input.style === 'concise' ? 'concise' : 'standard';

  const config = resumeConfig();
  if (!config) throw unavailable();
  const allowance = await allowanceFor(userId);
  if (allowance.remaining <= 0) {
    throw codedError(429, allowance.premium
      ? 'You have reached today\'s resume limit. It resets at midnight (UTC).'
      : 'You have reached today\'s free resume limit. It resets at midnight (UTC), or Premium raises it.', 'RESUME_DAILY_LIMIT');
  }

  const instructions = [
    `Style: ${style === 'concise' ? 'concise, one page, short bullet points' : 'standard, clear and complete'}.`,
    targetRole ? `Target role (use only to choose emphasis and ordering, never to add facts): ${targetRole}.` : '',
    'Source text follows between the markers.',
    '<<<SOURCE', text, 'SOURCE>>>'
  ].filter(Boolean).join('\n');

  let answer;
  try {
    answer = await aiProvider.chatCompletion(config, [
      { role: 'system', content: RESUME_SYSTEM_PROMPT },
      { role: 'user', content: instructions }
    ], { maxTokens: 1500, timeoutMs: Math.max(config.timeoutMs, 20000) });
  } catch (error) {
    if (error.sapleCode === 'AI_RATE_LIMITED') {
      throw codedError(429, 'The resume generator is busy right now. Please try again in a minute.', 'RESUME_BUSY');
    }
    throw unavailable();
  }
  // Usage metadata only: who, which feature, which model and token counts.
  await premiumRepository.recordAiUsage({
    userId, featureType: 'RESUME_GENERATION', model: config.model,
    inputTokens: answer.inputTokens, outputTokens: answer.outputTokens
  });

  const raw = parseResumeJson(answer.content);
  if (!raw || typeof raw !== 'object') {
    throw codedError(502, 'The resume could not be formatted this time. Please try again.', 'RESUME_FORMAT_FAILED');
  }
  return {
    resume: shapeResume(raw, text),
    style,
    targetRole,
    remaining: Math.max(0, allowance.remaining - 1),
    pdfAvailable: allowance.premium
  };
}

// The official PDF export. The route requires Premium; this checks the body.
function resumePdf(input = {}) {
  const resume = shapeResume(input.resume || {});
  const hasContent = resume.name || resume.summary || resume.experience.length || resume.education.length
    || resume.projects.length || resume.skills.length;
  if (!hasContent) throw createHttpError(400, 'Generate a resume before downloading it.');
  const first = String(resume.name || '').trim().split(/\s+/)[0] || '';
  const safeName = first.normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return {
    fileName: `Saple_Resume${safeName ? `_${safeName}` : ''}.pdf`,
    content: buildResumePdf(resume)
  };
}

module.exports = {
  RESUME_SYSTEM_PROMPT, MAX_RESUME_CHARS, MIN_RESUME_CHARS,
  isAvailable, getStatus, generateResume, resumePdf, shapeResume, parseResumeJson
};
