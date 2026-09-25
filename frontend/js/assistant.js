import { apiRequest, fetchApi } from './api.js';
import { el, clear, trapFocus } from './ui.js';

// Saple Guide.
//
// The panel holds a short in-memory conversation only. Nothing is written to
// storage, nothing is sent anywhere except Saple's own /api/assistant route,
// and every reply is rendered with textContent, so a model can never inject
// markup into the page.

const MAX_TURNS = 8;
const conversation = [];

let status = null;
let panel = null;
let releaseFocus = null;
let launcher = null;
let transcript = null;
let form = null;
let input = null;
let sendButton = null;
let root = null;
let statusPill = null;

// What each answer actually came from. The guide never presents built-in help
// as if a model had written it, and never hides that the provider failed.
const SOURCE_LABELS = Object.freeze({
  AI: { text: 'AI-assisted', tone: 'online' },
  POLICY: { text: 'Saple safety rule', tone: 'policy' },
  FALLBACK: { text: 'Built-in Saple help (not AI)', tone: 'offline' }
});

// Reasons the online guide did not answer. The first two are configuration
// (there is nothing to retry); the rest are transient, so the reader is offered
// another attempt.
const OUTAGE_REASONS = Object.freeze({
  DISABLED: { message: 'The online guide is switched off for this deployment.', retry: false },
  NOT_CONFIGURED: { message: 'The online guide is not configured for this deployment.', retry: false },
  TIMEOUT: { message: 'The online guide timed out.', retry: true },
  AI_RATE_LIMITED: { message: 'The online guide has hit its rate limit.', retry: true },
  AI_PROVIDER_ERROR: { message: 'The online guide is temporarily unavailable.', retry: true }
});

function setStatus(state, text) {
  if (!statusPill) return;
  statusPill.dataset.state = state;
  statusPill.textContent = text;
}

function appendMessage(role, text) {
  const message = el('li', {
    className: `guide-message guide-message-${role}`,
    dataset: { role }
  }, [
    el('span', { className: 'guide-author', text: role === 'user' ? 'You' : 'Saple Guide' }),
    el('p', { className: 'guide-text', text })
  ]);
  transcript.append(message);
  transcript.scrollTop = transcript.scrollHeight;
  return message;
}

function renderSuggestions() {
  if (!status?.suggestedQuestions?.length || conversation.length > 0) return null;

  const list = el('ul', { className: 'guide-suggestions', attrs: { 'aria-label': 'Suggested questions' } });
  for (const question of status.suggestedQuestions) {
    const button = el('button', {
      className: 'guide-suggestion',
      text: question,
      attrs: { type: 'button' }
    });
    button.addEventListener('click', () => {
      input.value = question;
      form.requestSubmit();
    });
    list.append(el('li', {}, [button]));
  }
  return list;
}

async function submitQuestion(event) {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  transcript.querySelector('.guide-suggestions')?.remove();
  transcript.querySelector('.guide-intro-empty')?.remove();
  appendMessage('user', question);
  conversation.push({ role: 'user', content: question });
  while (conversation.length > MAX_TURNS) conversation.shift();

  input.value = '';
  input.disabled = true;
  sendButton.disabled = true;
  setStatus('working', 'Asking…');
  const pending = appendMessage('assistant', 'Thinking…');
  pending.classList.add('is-pending');

  try {
    const result = await apiRequest('/api/assistant/messages', {
      method: 'POST',
      body: { messages: conversation }
    });
    pending.classList.remove('is-pending');
    pending.querySelector('.guide-text').textContent = result.answer;

    const label = SOURCE_LABELS[result.source] || SOURCE_LABELS.FALLBACK;
    pending.dataset.source = result.source;
    pending.append(el('span', { className: `guide-source guide-source-${label.tone}`, text: label.text }));

    if (result.source === 'AI') {
      setStatus('online', 'Online');
    } else if (result.source === 'FALLBACK') {
      const outage = OUTAGE_REASONS[result.reason] || OUTAGE_REASONS.AI_PROVIDER_ERROR;
      setStatus('offline', outage.retry ? 'Online guide unavailable' : 'Built-in help');
      pending.append(el('span', { className: 'guide-note', text: `${outage.message} This answer comes from Saple's built-in help.` }));
      if (outage.retry) pending.append(retryButton(question, pending));
    }
    conversation.push({ role: 'assistant', content: result.answer });
  } catch (error) {
    pending.classList.remove('is-pending');
    pending.classList.add('is-error');
    pending.querySelector('.guide-text').textContent = error.kind === 'RATE_LIMITED'
      ? 'The guide is busy right now. Please wait a moment and ask again.'
      : 'The guide could not answer just now. Please try again.';
    setStatus('offline', 'Online guide unavailable');
    pending.append(retryButton(question, pending));
    conversation.pop();
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }
}

// Re-asks the same question. The failed exchange is removed first so the
// conversation the provider sees stays consistent.
function retryButton(question, message) {
  const retry = el('button', {
    className: 'button button-secondary button-small guide-retry',
    text: 'Try the online guide again',
    attrs: { type: 'button' }
  });
  retry.addEventListener('click', () => {
    input.value = question;
    message.remove();
    if (conversation[conversation.length - 1]?.role === 'assistant') conversation.pop();
    if (conversation[conversation.length - 1]?.role === 'user') conversation.pop();
    form.requestSubmit();
  });
  return retry;
}

function closePanel() {
  if (!panel) return;
  releaseFocus?.();
  releaseFocus = null;
  panel.hidden = true;
  root.classList.remove('is-open');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.focus();
}

function openPanel() {
  panel.hidden = false;
  root.classList.add('is-open');
  launcher.setAttribute('aria-expanded', 'true');
  releaseFocus = trapFocus(panel, { onEscape: closePanel });
  input.focus();
}

function buildPanel() {
  // A live region: a screen reader hears "Asking…", then whether the answer
  // came from the online guide or from built-in help.
  statusPill = el('span', {
    className: 'guide-status',
    attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    dataset: { state: status?.aiEnabled ? 'online' : 'offline' }
  });
  statusPill.textContent = status?.aiEnabled ? 'Online' : 'Built-in help';

  transcript = el('ul', {
    className: 'guide-transcript',
    attrs: { 'aria-live': 'polite', 'aria-label': 'Conversation with the Saple Guide' }
  });
  input = el('input', {
    className: 'input guide-input',
    attrs: {
      type: 'text',
      id: 'guide-question',
      name: 'question',
      maxlength: String(status?.maxMessageLength || 500),
      autocomplete: 'off',
      placeholder: 'Ask how to use Saple'
    }
  });

  sendButton = el('button', { className: 'button button-primary button-small guide-send', text: 'Send', attrs: { type: 'submit' } });
  const send = sendButton;
  form = el('form', { className: 'guide-form' }, [
    el('label', { className: 'sr-only', text: 'Ask the Saple Guide', attrs: { for: 'guide-question' } }),
    input,
    send
  ]);
  form.addEventListener('submit', submitQuestion);

  const clearButton = el('button', {
    className: 'guide-clear',
    text: 'Clear conversation',
    attrs: { type: 'button' }
  });
  clearButton.addEventListener('click', () => {
    conversation.length = 0;
    clear(transcript);
    renderIntro();
    input.focus();
  });

  const close = el('button', {
    className: 'guide-close',
    attrs: { type: 'button', 'aria-label': 'Close the Saple Guide' }
  }, [el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' })]);
  close.addEventListener('click', closePanel);

  panel = el('div', {
    className: 'guide-panel',
    attrs: {
      role: 'dialog',
      'aria-label': 'Saple Guide',
      'aria-modal': 'false',
      tabindex: '-1',
      hidden: true,
      id: 'saple-guide-panel'
    }
  }, [
    el('div', { className: 'guide-head' }, [
      el('div', {}, [
        el('div', { className: 'guide-heading-row' }, [
          el('h2', { className: 'guide-heading', text: status?.label || 'Saple Guide (AI-assisted)' }),
          statusPill
        ]),
        el('p', {
          className: 'guide-scope',
          text: 'Helps with using Saple only. It cannot see your account or make changes.'
        })
      ]),
      close
    ]),
    transcript,
    form,
    el('div', { className: 'guide-foot' }, [
      el('p', {
        className: 'guide-disclosure',
        text: 'AI-assisted. Do not enter passwords, reset links or personal details.'
      }),
      el('div', { className: 'guide-foot-actions' }, [
        el('details', { className: 'guide-privacy-details' }, [
          el('summary', { text: 'Privacy' }),
          el('p', { className: 'guide-privacy', text: status?.privacyNotice || '' })
        ]),
        clearButton
      ])
    ])
  ]);

  renderIntro();
  return panel;
}

function renderIntro() {
  const intro = el('li', { className: 'guide-message guide-message-assistant guide-intro-empty' }, [
    el('span', { className: 'guide-author', text: 'Saple Guide' }),
    el('p', {
      className: 'guide-text',
      text: status?.aiEnabled
        ? 'Ask me anything about using Saple: companies, salary ranges, verification, jobs, applications or your account.'
        : 'The AI provider is not configured for this deployment, so I am answering from Saple’s built-in help instead. Ask about salary ranges, verification, jobs, applications or your account.'
    })
  ]);
  transcript.append(intro);
  const suggestions = renderSuggestions();
  if (suggestions) transcript.append(el('li', { className: 'guide-message guide-suggestions-row' }, [suggestions]));
}

export async function mountAssistant() {
  if (document.querySelector('[data-saple-guide]')) return;

  try {
    status = await fetchApi('/api/assistant/status');
  } catch (error) {
    // Without the status endpoint the guide would have nothing honest to say
    // about what it can do, so it stays out of the way entirely.
    return;
  }

  const container = el('div', { className: 'guide-root', dataset: { sapleGuide: '' } });
  root = container;
  launcher = el('button', {
    className: 'guide-launcher',
    attrs: {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'saple-guide-panel',
      'aria-label': 'Open the Saple Guide'
    }
  }, [
    el('span', { className: 'guide-launcher-icon', attrs: { 'aria-hidden': 'true' }, text: '?' }),
    el('span', { className: 'guide-launcher-label', text: 'Saple Guide' })
  ]);
  launcher.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));

  // The panel comes first so it opens above the launcher, which stays in the
  // bottom-right corner.
  container.append(buildPanel(), launcher);
  document.body.append(container);
  // Lets the stylesheet leave room so the last content on a page can always
  // scroll clear of the floating launcher.
  document.body.classList.add('has-saple-guide');
}
