import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el } from './ui.js';
import { mountAssistant, openSharedView, registerMessagesView } from './assistant.js';

let root;
let panel;
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
let searchInput;
let searchTimer;
let searchSequence = 0;
let mounting = null;

function open() {
  if (!root) return;
  openSharedView('messages');
  if (peer) input.focus(); else searchInput.focus();
}
function showError(error) {
  if (error?.status === 503) {
    input.disabled = true; sendButton.disabled = true;
    body?.querySelector('.messages-availability')?.remove();
    body?.prepend(el('p', { className: 'state-message error messages-availability', text: 'Messaging requires the online database.' }));
  } else if (body) body.replaceChildren(el('p', { className: 'state-message error', text: error.message || 'Messages are unavailable.' }));
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
  searchInput.parentElement.hidden = false;
  body.replaceChildren();
  if (!items.length) { body.append(el('p', { className: 'messages-empty', text: 'No conversations yet. Search people above to start one.' })); return; }
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
  searchInput.parentElement.hidden = true;
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
  const peerId = peer.userId;
  const data = await apiRequest(`/api/messages/with/${peerId}`, { auth: true });
  if (!peer || peer.userId !== peerId) return;
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
async function refreshList() {
  const data = await apiRequest('/api/messages/conversations', { auth: true });
  if (!peer && !searchInput.value.trim()) renderList(data.conversations);
  await refreshUnread();
}
async function refresh() {
  if (busy || !isAuthenticated() || document.hidden) return;
  busy = true;
  try {
    if (peer) await refreshHistory();
    else if (!panel.hidden && !searchInput.value.trim()) await refreshList();
    else await refreshUnread();
    lastPoll = Date.now();
  } finally { busy = false; }
}
export async function openConversation(userId) {
  if (!isAuthenticated()) return;
  await mountMessages();
  if (!root) return;
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1 || id === getStoredUser()?.userId) return;
  peer = { userId: id, fullName: 'Loading…' };
  messages = []; hasMore = false;
  open();
  try { await refreshHistory(); } catch (error) { showError(error); }
}
function backToList() {
  peer = null; messages = []; editing = null; input.value = ''; form.hidden = true;
  searchInput.value = '';
  ++searchSequence;
  title.textContent = 'Messages'; headerAvatar.hidden = true; back.hidden = true;
  searchInput.parentElement.hidden = false;
  body.replaceChildren(el('p', { className: 'messages-empty', text: 'Loading conversations…' }));
  refreshList().catch(showError);
}
function renderPeople(items) {
  body.replaceChildren();
  if (!items.length) {
    body.append(el('p', { className: 'messages-empty', text: 'No people found.' }));
    return;
  }
  for (const person of items) {
    const button = el('button', { className: 'messages-contact', attrs: { type: 'button' } }, [
      avatar(person),
      el('span', { className: 'messages-contact-copy' }, [
        el('strong', { text: person.fullName }),
        el('span', { text: person.displayLabel || 'Saple member' })
      ])
    ]);
    button.addEventListener('click', () => openConversation(person.userId));
    body.append(button);
  }
}

async function searchPeople() {
  const query = searchInput.value.trim();
  const sequence = ++searchSequence;
  if (query.length < 2) { refreshList().catch(showError); return; }
  try {
    const data = await apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`, { auth: true });
    if (sequence === searchSequence && !peer) renderPeople(data.users);
  } catch (error) { if (sequence === searchSequence) showError(error); }
}

export function mountMessages() {
  if (mounting) return mounting;
  if (!isAuthenticated()) return Promise.resolve();
  mounting = (async () => {
  root = await mountAssistant();
  if (!root) root = await mountAssistant({ allowUnavailable: true });
  if (!root) return;
  title = el('h2', { className: 'guide-heading', text: 'Messages' });
  headerAvatar = el('span', { className: 'messages-header-avatar' }); headerAvatar.hidden = true;
  back = el('button', { className: 'guide-close', text: '←', attrs: { type: 'button', 'aria-label': 'Back to conversations' } });
  back.hidden = true; back.addEventListener('click', backToList);
  searchInput = el('input', { className: 'input messages-search', attrs: {
    type: 'search', placeholder: 'Search people', 'aria-label': 'Search people', maxlength: '80'
  } });
  searchInput.addEventListener('input', () => {
    ++searchSequence;
    clearTimeout(searchTimer);
    if (searchInput.value.trim().length < 2) {
      refreshList().catch(showError);
      return;
    }
    searchTimer = setTimeout(searchPeople, 280);
  });
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
  panel = el('section', { className: 'shared-view messages-view', attrs: {
    role: 'tabpanel', id: 'saple-messages-view', 'aria-labelledby': 'saple-messages-tab', hidden: true
  } }, [
    el('div', { className: 'messages-view-head' }, [back, headerAvatar, title]),
    el('div', { className: 'messages-search-wrap' }, [searchInput]), body, form
  ]);
  badge = el('span', { className: 'messages-launcher-badge', attrs: { 'aria-label': 'Unread messages' } });
  badge.hidden = true;
  registerMessagesView(panel, badge, () => refresh().catch(showError));
  window.addEventListener('saple:open-message', (event) => openConversation(event.detail?.userId));
  setInterval(() => {
    if (!isAuthenticated() || document.hidden) return;
    const delay = panel.hidden ? 20000 : peer ? 4000 : 9000;
    if (Date.now() - lastPoll >= delay) refresh().catch(showError);
  }, 4000);
  refreshUnread().catch(() => {});
  })();
  return mounting;
}
