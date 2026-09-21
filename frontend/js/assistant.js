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
let root = null;

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
  const pending = appendMessage('assistant', 'Thinking…');
  pending.classList.add('is-pending');

  try {
    const result = await apiRequest('/api/assistant/messages', {
      method: 'POST',
      body: { messages: conversation }
    });
    pending.classList.remove('is-pending');
    pending.querySelector('.guide-text').textContent = result.answer;

    if (result.source === 'FALLBACK') {
      pending.append(el('span', {
        className: 'guide-note',
        text: 'Offline help mode: answered from Saple’s built-in guide rather than the AI provider.'
      }));
    }
    conversation.push({ role: 'assistant', content: result.answer });
  } catch (error) {
    pending.classList.remove('is-pending');
    pending.classList.add('is-error');
    pending.querySelector('.guide-text').textContent = error.kind === 'RATE_LIMITED'
      ? 'The guide is busy right now. Please wait a moment and ask again.'
      : 'The guide could not answer just now. Please try again.';
    const retry = el('button', {
      className: 'button button-secondary button-small',
      text: 'Try again',
      attrs: { type: 'button' }
    });
    retry.addEventListener('click', () => {
      input.value = question;
      pending.remove();
      conversation.pop();
      form.requestSubmit();
    });
    pending.append(retry);
    conversation.pop();
  } finally {
    input.disabled = false;
    input.focus();
  }
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

  const send = el('button', { className: 'button button-primary button-small guide-send', text: 'Send', attrs: { type: 'submit' } });
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
        el('h2', { className: 'guide-heading', text: status?.label || 'Saple Guide (AI-assisted)' }),
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
