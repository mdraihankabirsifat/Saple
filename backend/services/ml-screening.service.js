// Private, fail-closed client for public-content moderation assistance.
// It never receives credentials, messages, application documents or payments.
// Deployment starts in shadow mode: no model result can publish by default.
const CONTENT_TYPES = new Set(['SALARY', 'REVIEW', 'INTERVIEW', 'JOB', 'PROFILE', 'COMPANY']);
const REASON = /^[A-Z][A-Z0-9_]{1,63}$/;
const timeoutMs = () => Math.max(250, Math.min(5000, Number(process.env.ML_SCREEN_TIMEOUT_MS) || 1500));
const enabled = () => process.env.ML_SCREENING_ENABLED === 'true';
const shadow = () => process.env.ML_SHADOW_MODE !== 'false';
const publishEnabled = () => process.env.ML_AUTO_PUBLISH_ENABLED === 'true' && !shadow();

function unavailable(type, reason = 'ML_SERVICE_UNAVAILABLE') {
  return {
    contentType: type, screeningStatus: 'UNAVAILABLE', publicationState: 'HELD',
    modelKey: null, modelVersion: null, featureSchemaVersion: null,
    riskProbability: null, confidence: null, reasonCodes: [reason], modelMetadata: {}
  };
}

function normalize(type, result) {
  if (!result || result.contentType !== type || !['AUTO_PUBLISH', 'MANUAL_REVIEW'].includes(result.decision)) {
    return unavailable(type, 'INVALID_MODEL_RESPONSE');
  }
  const risk = result.riskProbability;
  const threshold = result.autoPublishThreshold;
  const plausible = typeof risk === 'number' && Number.isFinite(risk) && risk >= 0 && risk <= 1;
  const validThreshold = typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
  const modelKey = typeof result.modelKey === 'string' && result.modelKey.length <= 160 ? result.modelKey : null;
  const modelVersion = typeof result.modelVersion === 'string' && result.modelVersion.length <= 80 ? result.modelVersion : null;
  const featureSchemaVersion = typeof result.featureSchemaVersion === 'string' && result.featureSchemaVersion.length <= 80
    ? result.featureSchemaVersion : null;
  const autoDecision = result.decision === 'AUTO_PUBLISH' && result.eligible === true
    && result.outOfDistribution === false && plausible && validThreshold && risk <= threshold
    && modelKey && modelVersion && featureSchemaVersion;
  const allowedTypes = new Set(String(process.env.ML_AUTO_PUBLISH_TYPES || '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean));
  const publicationState = autoDecision && publishEnabled() && allowedTypes.has(type) ? 'PROVISIONAL' : 'HELD';
  const reasonCodes = Array.isArray(result.reasonCodes)
    ? result.reasonCodes.filter((value) => typeof value === 'string' && REASON.test(value)).slice(0, 12)
    : [];
  if (result.decision === 'AUTO_PUBLISH' && !autoDecision) reasonCodes.push('MODEL_NOT_ELIGIBLE');
  return {
    contentType: type,
    screeningStatus: autoDecision ? 'AUTO_PUBLISH' : 'MANUAL_REVIEW',
    publicationState,
    modelKey, modelVersion, featureSchemaVersion,
    riskProbability: plausible ? risk : null,
    confidence: plausible ? 1 - risk : null,
    reasonCodes,
    modelMetadata: validThreshold ? { autoPublishThreshold: threshold, shadowMode: shadow() } : { shadowMode: shadow() }
  };
}

async function screen(type, publicFields) {
  if (!enabled()) return null;
  if (!CONTENT_TYPES.has(type)) throw new TypeError('Unsupported public content type');
  const url = process.env.ML_SERVICE_URL;
  const token = process.env.ML_SERVICE_TOKEN;
  if (!url || !token) return unavailable(type);
  let endpoint;
  try {
    endpoint = new URL('/screen', url);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
      return unavailable(type, 'ML_SERVICE_URL_INVALID');
    }
  } catch { return unavailable(type, 'ML_SERVICE_URL_INVALID'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(endpoint, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-saple-ml-token': token },
      body: JSON.stringify({ contentType: type, featureSchemaVersion: '1', features: publicFields })
    });
    if (!response.ok) return unavailable(type);
    return normalize(type, await response.json());
  } catch { return unavailable(type, controller.signal.aborted ? 'ML_TIMEOUT' : 'ML_SERVICE_UNAVAILABLE'); }
  finally { clearTimeout(timer); }
}

module.exports = { screen, normalize, unavailable, enabled, shadow, publishEnabled };
