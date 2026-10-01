const aiConfig = require('../config/ai');

// The one place Saple calls an AI provider. The Saple Guide (standard and
// Premium) and the resume generator share this request shape, its timeout and
// its error handling. Provider errors become a short code; the provider's own
// message, which can echo request details, never leaves this function.

function providerError(code) {
  const error = new Error(`AI provider unavailable (${code})`);
  error.sapleCode = code;
  return error;
}

// The configured Premium model on the same provider, or null when the site
// owner has not set PREMIUM_AI_MODEL. It never changes the provider URL or key.
function premiumModelConfig(baseConfig) {
  const model = process.env.PREMIUM_AI_MODEL?.trim();
  if (!baseConfig || !model || model.length > 120) return null;
  return { ...baseConfig, model };
}

// The standard provider settings, or null when the guide is switched off or
// misconfigured. Configuration problems are never thrown at a visitor.
function standardConfig() {
  try {
    return aiConfig.getAiConfig();
  } catch (error) {
    return null;
  }
}

async function chatCompletion(config, messages, { maxTokens, temperature = 0.2, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs);
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature, max_tokens: maxTokens || config.maxOutputTokens, messages })
    });
  } catch (error) {
    throw providerError(error.name === 'AbortError' ? 'TIMEOUT' : 'AI_PROVIDER_ERROR');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw providerError(response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR');

  const body = await response.json().catch(() => null);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw providerError('AI_PROVIDER_ERROR');
  return {
    content,
    inputTokens: Number.isInteger(body?.usage?.prompt_tokens) ? body.usage.prompt_tokens : null,
    outputTokens: Number.isInteger(body?.usage?.completion_tokens) ? body.usage.completion_tokens : null
  };
}

module.exports = { chatCompletion, premiumModelConfig, standardConfig, providerError };
