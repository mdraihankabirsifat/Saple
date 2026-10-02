import { apiRequest } from './api.js';
import { el, clear, trapFocus } from './ui.js';

// Saple Guide.
//
// The panel holds a short in-memory conversation only. Nothing is written to
// storage, nothing is sent anywhere except Saple's own /api/assistant route,
// and every reply is rendered with textContent, so a model can never inject
// markup into the page.

// Informational only: shows which tier answered. The server decides it from
// the member's current Premium or trial access on every message.
const tierBadge = el('span', {
  className: 'guide-tier-badge',
  text: 'PRO',
  attrs: { title: 'Advanced answers for Premium members', hidden: true }
});

function setTierIndicator(access) {
  tierBadge.hidden = !access;
}

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
let guideView = null;
let messagesView = null;
let guideTab = null;
let messagesTab = null;
let onMessagesOpen = null;
let mounting = null;

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

  transcript.querySelector('.guide-suggestions-row')?.remove();
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
    // A signed-in session is sent when there is one, so the server can pick
    // the Premium tier for Premium and trial members. The browser never asks.
    const result = await apiRequest('/api/assistant/messages', {
      method: 'POST',
      auth: 'optional',
      body: { messages: conversation }
    });
    setTierIndicator(result.premiumMember);
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
  document.body.classList.remove('guide-panel-open');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.focus();
}

function selectView(view) {
  const messages = view === 'messages' && messagesView;
  guideView.hidden = Boolean(messages);
  if (messagesView) messagesView.hidden = !messages;
  guideTab.setAttribute('aria-selected', String(!messages));
  if (messagesTab) messagesTab.setAttribute('aria-selected', String(Boolean(messages)));
  panel.setAttribute('aria-label', messages ? 'Messages and Saple Guide: Messages' : 'Messages and Saple Guide: Saple Guide');
  if (messages) onMessagesOpen?.();
}

function openPanel(view = 'guide') {
  const wasClosed = panel.hidden;
  window.dispatchEvent(new CustomEvent('saple:floating-panel-open', { detail: { panel: 'shared' } }));
  selectView(view);
  panel.hidden = false;
  root.classList.add('is-open');
  document.body.classList.add('guide-panel-open');
  launcher.setAttribute('aria-expanded', 'true');
  if (wasClosed) releaseFocus = trapFocus(panel, { onEscape: closePanel });
  if (view === 'guide') input.focus();
  else messagesView?.querySelector('input, button')?.focus();
  // Recheck entitlement whenever the panel opens, including after expiry.
  apiRequest('/api/assistant/status', { auth: 'optional' })
    .then((fresh) => { status = fresh; setTierIndicator(fresh.premiumMember); })
    .catch(() => setTierIndicator(false));
}

export function openSharedView(view = 'guide') {
  if (panel) openPanel(view);
}

export function registerMessagesView(view, unreadBadge, onOpen) {
  if (!panel || messagesView) return;
  messagesView = view;
  messagesView.hidden = true;
  panel.append(messagesView);
  onMessagesOpen = onOpen;
  messagesTab = el('button', { className: 'shared-tab', text: 'Messages', attrs: {
    type: 'button', role: 'tab', id: 'saple-messages-tab', 'aria-selected': 'false', 'aria-controls': 'saple-messages-view'
  } });
  messagesTab.addEventListener('click', () => openPanel('messages'));
  guideTab.before(messagesTab);
  launcher.append(unreadBadge);
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
    attrs: { type: 'button', 'aria-label': 'Close Messages and Saple Guide' }
  }, [el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' })]);
  close.addEventListener('click', closePanel);

  guideView = el('div', { className: 'shared-view guide-view', attrs: {
    id: 'saple-guide-view', role: 'tabpanel', 'aria-labelledby': 'saple-guide-tab'
  } }, [
    el('div', { className: 'guide-view-heading guide-heading-row' }, [
      el('h2', { className: 'guide-heading' }, ['Saple Guide', tierBadge]), statusPill
    ]),
    transcript,
    form,
    el('div', { className: 'guide-foot' }, [
      el('p', { className: 'guide-disclosure', text: 'AI-assisted. Do not enter passwords, reset links or personal details.' }),
      el('div', { className: 'guide-foot-actions' }, [
        el('details', { className: 'guide-privacy-details' }, [
          el('summary', { text: 'Privacy' }),
          el('p', { className: 'guide-privacy', text: status?.privacyNotice || '' })
        ]), clearButton
      ])
    ])
  ]);
  guideTab = el('button', { className: 'shared-tab', text: 'Saple Guide', attrs: {
    type: 'button', role: 'tab', id: 'saple-guide-tab', 'aria-selected': 'true', 'aria-controls': 'saple-guide-view'
  } });
  guideTab.addEventListener('click', () => openPanel('guide'));

  panel = el('div', {
    className: 'guide-panel',
    attrs: {
      role: 'dialog',
      'aria-label': 'Messages and Saple Guide: Saple Guide',
      'aria-modal': 'false',
      tabindex: '-1',
      hidden: true,
      id: 'saple-guide-panel'
    }
  }, [
    el('div', { className: 'guide-head shared-head' }, [
      el('div', { className: 'shared-tabs', attrs: { role: 'tablist', 'aria-label': 'Communication views' } }, [guideTab]),
      close
    ]),
    guideView
  ]);

  renderIntro();
  return panel;
}

function renderIntro() {
  const suggestions = renderSuggestions();
  if (suggestions) transcript.append(el('li', { className: 'guide-message guide-suggestions-row' }, [suggestions]));
}

export function mountAssistant({ allowUnavailable = false } = {}) {
  if (mounting) return mounting;
  mounting = (async () => {
  if (document.querySelector('[data-saple-guide]')) return root;

  try {
    status = await apiRequest('/api/assistant/status', { auth: 'optional' });
    setTierIndicator(status?.premiumMember);
  } catch (error) {
    // Keep the original public guide behavior, but allow signed-in Messages
    // to mount the shared panel when the status endpoint is unavailable.
    if (!allowUnavailable) return;
    status = { aiEnabled: false, suggestedQuestions: [] };
  }

  const container = el('div', { className: 'guide-root', dataset: { sapleGuide: '' } });
  root = container;
  launcher = el('button', {
    className: 'guide-launcher',
    attrs: {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'saple-guide-panel',
      'aria-label': 'Open Messages and Saple Guide'
    }
  }, [el('span', { className: 'guide-launcher-label', text: 'Messages & Guide' })]);
  launcher.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));

  // The panel comes first so it opens above the launcher, which stays in the
  // bottom-right corner.
  container.append(buildPanel(), launcher);
  document.body.append(container);
  // Lets the stylesheet leave room so the last content on a page can always
  // scroll clear of the floating launcher.
  document.body.classList.add('has-saple-guide');
  window.addEventListener('saple:floating-panel-open', (event) => {
    if (event.detail?.panel !== 'shared' && panel && !panel.hidden) closePanel();
  });
  return root;
  })().then((result) => {
    if (!result) mounting = null;
    return result;
  }, (error) => { mounting = null; throw error; });
  return mounting;
}
