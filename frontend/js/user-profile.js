import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el } from './ui.js';
import { premiumBadge } from './premium-ui.js';

const status = document.querySelector('#user-profile-status');
const content = document.querySelector('#user-profile-content');
const raw = new URLSearchParams(location.search).get('id');
function section(title, items, describe) {
  if (!items?.length) return null;
  const list = el('ul', { className: 'professional-list' });
  for (const item of items) {
    const { heading, detail, description } = describe(item);
    list.append(el('li', { className: 'professional-item' }, [el('div', {}, [
      el('h3', { text: heading }), el('p', { className: 'professional-meta', text: detail }),
      description ? el('p', { text: description }) : null
    ])]));
  }
  return el('section', { className: 'public-profile-section' }, [el('h3', { text: title }), list]);
}
function dates(item, currentField) {
  return `${item.startDate} – ${item[currentField] ? 'Present' : item.endDate}`;
}
// Profiles are public and read-only; messaging a member needs an account.
const signedIn = isAuthenticated();
if (!/^\d+$/.test(raw || '')) status.textContent = 'Invalid member profile.';
else apiRequest(`/api/users/${raw}/profile`, { auth: signedIn }).then(({ user }) => {
  status.hidden = true;
  content.hidden = false;
  document.title = `${user.fullName} | Saple`;
  const avatar = el('div', { className: 'profile-avatar' });
  if (user.avatarUrl) {
    const image = el('img', { attrs: { src: user.avatarUrl, alt: '' } });
    image.addEventListener('error', () => { image.remove(); avatar.textContent = user.fullName[0]?.toUpperCase() || 'S'; });
    avatar.append(image);
  } else avatar.textContent = user.fullName[0]?.toUpperCase() || 'S';
  const own = signedIn && user.userId === getStoredUser()?.userId;
  const signInToMessage = `login.html?returnTo=${encodeURIComponent(`user-profile.html?id=${user.userId}`)}`;
  const action = own
    ? el('a', { className: 'button button-primary', text: 'View my profile', attrs: { href: 'profile.html' } })
    : signedIn
      ? el('button', { className: 'button button-primary', text: 'Message', attrs: { type: 'button' } })
      : el('a', { className: 'button button-primary', text: 'Sign in to message', attrs: { href: signInToMessage } });
  if (!own && signedIn) action.addEventListener('click', async () => {
    const { mountMessages, openConversation } = await import('./messages.js');
    await mountMessages();
    await openConversation(user.userId);
  });
  const experience = section('Experience', user.experience, (item) => ({
    heading: `${item.jobTitle} · ${item.organization}`,
    detail: [item.employmentType, item.location, dates(item, 'currentlyWorking')].filter(Boolean).join(' · '),
    description: item.description
  }));
  const education = section('Education', user.education, (item) => ({
    heading: `${item.degree} · ${item.institution}`,
    detail: `${item.fieldOfStudy} · ${dates(item, 'currentlyStudying')}`,
    description: item.description
  }));
  const skills = user.skills?.length ? el('section', { className: 'public-profile-section' }, [
    el('h3', { text: 'Skills' }),
    el('ul', { className: 'professional-skills' }, user.skills.map((skill) =>
      el('li', { className: 'professional-skill', text: skill.name })))
  ]) : null;
  content.append(...[el('div', { className: 'public-profile-header' }, [avatar,
    el('div', {}, [el('h2', {}, [user.fullName, ' ', premiumBadge(user.premiumBadge)]),
      user.headline ? el('p', { className: 'public-profile-headline', text: user.headline }) : null,
      el('p', { className: 'professional-meta', text: user.displayLabel || 'Saple member' })]), action]),
  user.bio ? el('section', { className: 'public-profile-section' }, [
    el('h3', { text: 'About' }), el('p', { text: user.bio })
  ]) : null, experience, education, skills].filter(Boolean));
}).catch((error) => { status.textContent = error.message; });
