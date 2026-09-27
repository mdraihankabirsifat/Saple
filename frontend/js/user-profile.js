import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el } from './ui.js';

const status = document.querySelector('#user-profile-status');
const content = document.querySelector('#user-profile-content');
const raw = new URLSearchParams(location.search).get('id');
if (!isAuthenticated()) location.replace(`login.html?returnTo=${encodeURIComponent(`user-profile.html?id=${raw || ''}`)}`);
else if (!/^\d+$/.test(raw || '')) status.textContent = 'Invalid member profile.';
else apiRequest(`/api/users/${raw}/profile`, { auth: true }).then(({ user }) => {
  status.hidden = true;
  content.hidden = false;
  document.title = `${user.fullName} | Saple`;
  const avatar = el('div', { className: 'profile-avatar' });
  if (user.avatarUrl) {
    const image = el('img', { attrs: { src: user.avatarUrl, alt: '' } });
    image.addEventListener('error', () => { image.remove(); avatar.textContent = user.fullName[0]?.toUpperCase() || 'S'; });
    avatar.append(image);
  } else avatar.textContent = user.fullName[0]?.toUpperCase() || 'S';
  const own = user.userId === getStoredUser()?.userId;
  const action = own
    ? el('a', { className: 'button button-primary', text: 'View my profile', attrs: { href: 'profile.html' } })
    : el('button', { className: 'button button-primary', text: 'Message', attrs: { type: 'button' } });
  if (!own) action.addEventListener('click', async () => {
    const { mountMessages, openConversation } = await import('./messages.js');
    mountMessages(); openConversation(user.userId);
  });
  content.append(avatar, el('h2', { text: user.fullName }),
    el('p', { text: user.displayLabel || 'Saple member' }), action);
}).catch((error) => { status.textContent = error.message; });
