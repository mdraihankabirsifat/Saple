import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el } from './ui.js';

let root;
let panel;
let launcher;
let badge;
let body;
let title;
let headerAvatar;
let back;
let form;
let input;
let sendButton;
let cancelEdit;
let picker;
let peer = null;
let messages = [];
let editing = null;
let busy = false;
let lastPoll = 0;
let hasMore = false;

function open() {
  if (!root) return;
  window.dispatchEvent(new CustomEvent('saple:floating-panel-open', { detail: { panel: 'messages' } }));
  panel.hidden = false;
  root.classList.add('is-open');
  document.body.classList.add('messages-panel-open');
  launcher.setAttribute('aria-expanded', 'true');
  refresh().catch(showError);
  if (peer) input.focus(); else back.focus();
}
function close() {
  if (!root) return;
  panel.hidden = true;
  root.classList.remove('is-open');
  document.body.classList.remove('messages-panel-open');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.focus();
}
function showError(error) {
  if (error?.status === 503) {
    input.disabled = true; sendButton.disabled = true;
    body?.querySelector('.messages-availability')?.remove();
    body?.prepend(el('p', { className: 'state-message error messages-availability', text: 'Messaging requires the online database.' }));
  } else if (body && !body.childElementCount) body.append(el('p', { className: 'state-message error', text: error.message || 'Messages are unavailable.' }));
}
function initials(name) { return (name || 'S').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); }
function avatar(user) {
  const container = el('span', { className: 'messages-avatar' });
  if (user.avatarUrl) {
    const image = el('img', { attrs: { src: user.avatarUrl, alt: '' } });
    image.addEventListener('error', () => { image.remove(); container.textContent = initials(user.fullName); });
    container.append(image);
  } else container.textContent = initials(user.fullName);
  return container;
}
function renderList(items) {
  title.textContent = 'Messages'; headerAvatar.hidden = true; back.hidden = true; form.hidden = true;
  body.replaceChildren();
  if (!items.length) { body.append(el('p', { className: 'messages-empty', text: 'No conversations yet. Open a person’s profile or contact a company representative to start one.' })); return; }
  for (const item of items) {
    const button = el('button', { className: 'messages-contact', attrs: { type: 'button' } }, [
      avatar(item),
      el('span', { className: 'messages-contact-copy' }, [
        el('strong', { text: item.fullName }),
        el('span', { text: item.lastMessagePreview || 'Message deleted' })
      ]),
      el('span', { className: 'messages-contact-meta' }, [
        el('small', { text: new Date(item.lastMessageAt).toLocaleDateString() }),
        item.unreadCount ? el('b', { className: 'messages-unread', text: item.unreadCount }) : null
      ])
    ]);
    button.addEventListener('click', () => openConversation(item.userId));
    body.append(button);
  }
}
function renderHistory() {
  if (!peer) return;
  title.textContent = peer.fullName; headerAvatar.hidden = false;
  headerAvatar.replaceChildren(avatar(peer)); back.hidden = false; form.hidden = false;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  body.replaceChildren();
  if (messages.length && hasMore) {
    const older = el('button', { className: 'button button-secondary button-small', text: 'Load earlier', attrs: { type: 'button' } });
    older.addEventListener('click', async () => {
      try {
        const data = await apiRequest(`/api/messages/with/${peer.userId}?beforeMessageId=${messages[0].messageId}`, { auth: true });
        messages = [...data.messages, ...messages]; hasMore = data.hasMore; renderHistory();
      } catch (error) { showError(error); }
    });
    body.append(older);
  }
  if (!messages.length) body.append(el('p', { className: 'messages-empty', text: 'Start the conversation.' }));
  for (const message of messages) {
    const own = message.senderUserId === getStoredUser()?.userId;
    const item = el('div', { className: `messages-bubble ${own ? 'is-own' : ''}` }, [
      el('p', { text: message.deletedAt ? 'Message deleted' : message.messageBody }),
      el('small', { text: `${new Date(message.createdAt).toLocaleString()}${message.editedAt && !message.deletedAt ? ' · edited' : ''}` })
    ]);
    if (own && !message.deletedAt) {
      const actions = el('span', { className: 'messages-actions' });
      const edit = el('button', { text: 'Edit', attrs: { type: 'button' } });
      edit.addEventListener('click', () => { editing = message.messageId; input.value = message.messageBody; sendButton.textContent = 'Save'; cancelEdit.hidden = false; input.focus(); });
      const remove = el('button', { text: 'Delete', attrs: { type: 'button' } });
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this message?')) return;
        try { await apiRequest(`/api/messages/${message.messageId}`, { method: 'DELETE', auth: true }); await refreshHistory(); }
        catch (error) { showError(error); }
      });
      actions.append(edit, remove); item.append(actions);
    }
    body.append(item);
  }
  if (nearBottom) body.scrollTop = body.scrollHeight;
}
async function refreshHistory() {
  if (!peer) return;
  const data = await apiRequest(`/api/messages/with/${peer.userId}`, { auth: true });
  peer = data.user;
  if (messages.length <= 40) hasMore = data.hasMore;
  const previous = new Map(messages.map((item) => [item.messageId, item]));
  for (const item of data.messages) previous.set(item.messageId, item);
  messages = [...previous.values()].sort((a, b) => a.messageId - b.messageId);
  renderHistory();
  input.disabled = false; sendButton.disabled = false;
  await refreshUnread();
}
async function refreshUnread() {
  const data = await apiRequest('/api/messages/unread-count', { auth: true });
  badge.textContent = data.count > 99 ? '99+' : String(data.count);
  badge.hidden = !data.count;
}
async function refresh() {
  if (busy || !isAuthenticated() || document.hidden) return;
  busy = true;
  try {
    if (peer) await refreshHistory();
    else if (!panel.hidden) {
      const data = await apiRequest('/api/messages/conversations', { auth: true });
      renderList(data.conversations);
      await refreshUnread();
    } else await refreshUnread();
    lastPoll = Date.now();
  } finally { busy = false; }
}
export async function openConversation(userId) {
  if (!root || !isAuthenticated()) return;
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1 || id === getStoredUser()?.userId) return;
  peer = { userId: id, fullName: 'Loading…' };
  messages = []; hasMore = false;
  open();
}
function backToList() {
  peer = null; messages = []; editing = null; input.value = ''; form.hidden = true;
  refresh().catch(showError);
}
export function mountMessages() {
  if (root || !isAuthenticated()) return;
  title = el('h2', { className: 'guide-heading', text: 'Messages' });
  headerAvatar = el('span', { className: 'messages-header-avatar' }); headerAvatar.hidden = true;
  back = el('button', { className: 'guide-close', text: '←', attrs: { type: 'button', 'aria-label': 'Back to conversations' } });
  back.hidden = true; back.addEventListener('click', backToList);
  const closeButton = el('button', { className: 'guide-close', text: '×', attrs: { type: 'button', 'aria-label': 'Close messages' } });
  closeButton.addEventListener('click', close);
  body = el('div', { className: 'messages-body', attrs: { role: 'region', 'aria-label': 'Conversations and messages' } });
  input = el('textarea', { className: 'input', attrs: { rows: '2', maxlength: '2000', placeholder: 'Write a message', 'aria-label': 'Message text' } });
  sendButton = el('button', { className: 'button button-primary button-small', text: 'Send', attrs: { type: 'submit' } });
  cancelEdit = el('button', { className: 'button button-secondary button-small', text: 'Cancel', attrs: { type: 'button' } });
  cancelEdit.hidden = true;
  cancelEdit.addEventListener('click', () => { editing = null; input.value = ''; sendButton.textContent = 'Send'; cancelEdit.hidden = true; });
  picker = el('div', { className: 'messages-emoji-picker' }); picker.hidden = true;
  for (const emoji of ['😀', '🙂', '👍', '👏', '🎉', '❤️']) {
    const button = el('button', { text: emoji, attrs: { type: 'button', 'aria-label': `Insert ${emoji}` } });
    button.addEventListener('click', () => { input.value += emoji; picker.hidden = true; input.focus(); });
    picker.append(button);
  }
  const emojiButton = el('button', { className: 'button button-secondary button-small', text: '😊', attrs: { type: 'button', 'aria-label': 'Choose emoji' } });
  emojiButton.addEventListener('click', () => { picker.hidden = !picker.hidden; });
  form = el('form', { className: 'messages-form' }, [picker, input, el('div', { className: 'messages-form-actions' }, [emojiButton, cancelEdit, sendButton])]);
  form.hidden = true;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!peer || !input.value.trim()) return;
    sendButton.disabled = true;
    try {
      if (editing) await apiRequest(`/api/messages/${editing}`, { method: 'PATCH', auth: true, body: { messageBody: input.value } });
      else await apiRequest(`/api/messages/with/${peer.userId}`, { method: 'POST', auth: true, body: { messageBody: input.value } });
      editing = null; input.value = ''; sendButton.textContent = 'Send'; cancelEdit.hidden = true;
      await refreshHistory();
    } catch (error) { window.alert(error.message); }
    finally { sendButton.disabled = false; }
  });
  panel = el('section', { className: 'guide-panel messages-panel', attrs: { role: 'dialog', 'aria-label': 'Messages', id: 'saple-messages-panel', hidden: true } }, [
    el('div', { className: 'guide-head' }, [back, headerAvatar, title, closeButton]), body, form
  ]);
  badge = el('span', { className: 'messages-launcher-badge', attrs: { 'aria-label': 'Unread messages' } }); badge.hidden = true;
  launcher = el('button', { className: 'guide-launcher', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'saple-messages-panel' } }, [
    el('span', { text: 'Messages' }), badge
  ]);
  launcher.addEventListener('click', () => panel.hidden ? open() : close());
  root = el('div', { className: 'guide-root messages-root', dataset: { sapleMessages: '' } }, [panel, launcher]);
  document.body.append(root);
  window.addEventListener('saple:open-message', (event) => openConversation(event.detail?.userId));
  window.addEventListener('saple:floating-panel-open', (event) => { if (event.detail?.panel !== 'messages' && !panel.hidden) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) close(); });
  setInterval(() => {
    if (!isAuthenticated() || document.hidden) return;
    const delay = panel.hidden ? 20000 : peer ? 4000 : 9000;
    if (Date.now() - lastPoll >= delay) refresh().catch(showError);
  }, 4000);
  refreshUnread().catch(() => {});
}
