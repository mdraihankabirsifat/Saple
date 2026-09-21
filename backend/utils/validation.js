const createHttpError = require('./httpError');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

function positiveId(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw createHttpError(400, `Invalid ${label}`);
  }
  return Number(value);
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return positiveId(value, label);
}

// Normalizes whitespace so a field of spaces can never satisfy a length rule.
function requiredText(value, label, { min = 1, max = 500 } = {}) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (text.length < min || text.length > max) {
    throw createHttpError(400, `${label} must be between ${min} and ${max} characters`);
  }
  return text;
}

// Multi-line fields keep their paragraph breaks but lose trailing padding.
function requiredParagraph(value, label, { min = 1, max = 4000 } = {}) {
  const text = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  if (text.length < min || text.length > max) {
    throw createHttpError(400, `${label} must be between ${min} and ${max} characters`);
  }
  return text;
}

function optionalParagraph(value, label, { max = 4000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  if (!text) return null;
  if (text.length > max) {
    throw createHttpError(400, `${label} must not exceed ${max} characters`);
  }
  return text;
}

function optionalSearch(value, label = 'Search text', { max = 100 } = {}) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (text.length > max) {
    throw createHttpError(400, `${label} must not exceed ${max} characters`);
  }
  return text;
}

function enumValue(value, allowed, label, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw createHttpError(400, `${label} must be one of: ${allowed.join(', ')}`);
    return null;
  }
  const normalized = String(value).trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw createHttpError(400, `${label} must be one of: ${allowed.join(', ')}`);
  }
  return normalized;
}

function booleanValue(value, label, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw createHttpError(400, `${label} must be true or false`);
}

// YYYY-MM-DD only. Parsing is done by hand so "2026-02-31" cannot roll over.
function isoDate(value, label, { allowPast = true } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createHttpError(400, `${label} must be a date in YYYY-MM-DD format`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw createHttpError(400, `${label} is not a real calendar date`);
  }
  if (year < 2000 || year > 2100) {
    throw createHttpError(400, `${label} must be between 2000 and 2100`);
  }
  if (!allowPast) {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (parsed.getTime() < todayUtc) {
      throw createHttpError(400, `${label} must not be in the past`);
    }
  }
  return text;
}

function optionalTimestamp(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${label} must be a valid date and time`);
  }
  return parsed.toISOString();
}

function optionalMoney(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    throw createHttpError(400, `${label} must be a positive amount with at most two decimals`);
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, `${label} must be a positive amount`);
  }
  return amount;
}

function pagination(query = {}, { defaultSize = DEFAULT_PAGE_SIZE } = {}) {
  const pageValue = query.page === undefined || query.page === '' ? '1' : String(query.page);
  const sizeValue = query.pageSize === undefined || query.pageSize === ''
    ? String(defaultSize)
    : String(query.pageSize);

  if (!/^\d+$/.test(pageValue) || !/^\d+$/.test(sizeValue)) {
    throw createHttpError(400, 'Page and page size must be whole numbers');
  }

  const page = Math.max(1, Math.min(Number(pageValue), 10000));
  const pageSize = Math.max(1, Math.min(Number(sizeValue), MAX_PAGE_SIZE));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function paged(items, total, { page, pageSize }) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  positiveId,
  optionalId,
  requiredText,
  requiredParagraph,
  optionalParagraph,
  optionalSearch,
  enumValue,
  booleanValue,
  isoDate,
  optionalTimestamp,
  optionalMoney,
  pagination,
  paged
};
