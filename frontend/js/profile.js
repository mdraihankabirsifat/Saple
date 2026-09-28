import { apiRequest } from './api.js';
import { getCurrentUser, isAuthenticated, setStoredUser } from './auth.js';

const loadStatus = document.querySelector('#profile-load-status');
const content = document.querySelector('#profile-content');
const profileForm = document.querySelector('#profile-form');
const profileStatus = document.querySelector('#profile-status');
const contributionsStatus = document.querySelector('#contributions-status');
const contributionsList = document.querySelector('#contributions-list');
const avatar = document.querySelector('#profile-avatar');
const avatarFile = document.querySelector('#profile-avatar-file');
const avatarStatus = document.querySelector('#profile-avatar-status');
let currentUser;

function renderAvatar(user) {
  avatar.replaceChildren();
  if (user.avatarUrl) {
    const image = document.createElement('img');
    image.src = user.avatarUrl;
    image.alt = '';
    image.addEventListener('error', () => { image.remove(); avatar.textContent = user.fullName?.trim()?.[0]?.toUpperCase() || 'S'; });
    avatar.append(image);
  } else avatar.textContent = user.fullName?.trim()?.[0]?.toUpperCase() || 'S';
  document.querySelector('#profile-avatar-remove').hidden = !user.avatarPath;
}

function show(element, message, type = '') {
  element.textContent = message;
  element.className = 'state-message form-status';
  if (type) element.classList.add(type);
  element.hidden = false;
}

function render(user) {
  currentUser = user;
  renderAvatar(user);
  document.querySelector('#profile-name').value = user.fullName || '';
  document.querySelector('#profile-linkedin').value = user.linkedinUrl || '';
  document.querySelector('#profile-email').value = user.email || '';
  document.querySelector('#profile-user-type').textContent = user.userType || 'Unknown';
  document.querySelector('#profile-employment-status').textContent = user.employmentStatus || 'Not applicable';
  document.querySelector('#profile-account-role').textContent = user.accountRole || 'Unknown';
  document.querySelector('#profile-account-status').textContent = user.accountStatus || 'Unknown';
  const list = document.querySelector('#verified-company-list');
  const empty = document.querySelector('#no-verified-companies');
  list.replaceChildren();
  const scopes = Array.isArray(user.verifiedScopes) ? user.verifiedScopes : [];
  scopes.forEach((scope) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `company-details.html?id=${encodeURIComponent(scope.companyId)}`;
    link.textContent = scope.companyName;
    item.append(link, document.createTextNode(` · ${scope.roleName}`));
    list.append(item);
  });
  empty.hidden = scopes.length > 0;
  loadStatus.hidden = true;
  content.hidden = false;
}

document.querySelector('#profile-avatar-change').addEventListener('click', () => avatarFile.click());
avatarFile.addEventListener('change', async () => {
  const file = avatarFile.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    show(avatarStatus, 'Choose a JPEG, PNG or WebP image up to 2 MB.', 'error'); return;
  }
  const button = document.querySelector('#profile-avatar-change');
  button.disabled = true;
  try {
    const body = new FormData(); body.append('avatar', file);
    const result = await apiRequest('/api/me/avatar', { method: 'PUT', auth: true, body });
    const user = { ...currentUser, ...result };
    setStoredUser(user); render(user);
    show(avatarStatus, 'Profile picture updated.', 'success');
  } catch (error) { show(avatarStatus, error.message, 'error'); }
  finally { button.disabled = false; avatarFile.value = ''; }
});
document.querySelector('#profile-avatar-remove').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try {
    await apiRequest('/api/me/avatar', { method: 'DELETE', auth: true });
    const user = { ...currentUser, avatarPath: null, avatarUrl: null };
    setStoredUser(user); render(user);
    show(avatarStatus, 'Profile picture removed.', 'success');
  } catch (error) { show(avatarStatus, error.message, 'error'); }
  finally { event.currentTarget.disabled = false; }
});

function renderContributions(submissions) {
  contributionsList.replaceChildren();
  if (submissions.length === 0) {
    contributionsStatus.textContent = 'You have not submitted any contributions yet.';
    return;
  }
  submissions.forEach((submission) => {
    const item = document.createElement('li');
    const heading = document.createElement('strong');
    const metadata = document.createElement('span');
    heading.textContent = `${submission.submissionType} · ${submission.companyName}`;
    metadata.textContent = `${submission.submissionStatus} · ${submission.roleName || 'No designation'}`;
    item.append(heading, metadata);
    contributionsList.append(item);
  });
  contributionsStatus.hidden = true;
  contributionsList.hidden = false;
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault(); profileStatus.hidden = true;
  if (!profileForm.checkValidity()) { profileForm.reportValidity(); return; }
  const button = profileForm.querySelector('button'); button.disabled = true;
  try {
    const data = await apiRequest('/api/auth/me', {
      method: 'PATCH', auth: true, body: {
        fullName: document.querySelector('#profile-name').value,
        linkedinUrl: document.querySelector('#profile-linkedin').value
      }
    });
    setStoredUser(data.user); render(data.user); show(profileStatus, 'Profile updated successfully.', 'success');
  } catch (error) { show(profileStatus, error.message, 'error'); }
  finally { button.disabled = false; }
});

(async () => {
  if (!isAuthenticated()) {
    window.location.replace('login.html?returnTo=profile.html');
    return;
  }
  try {
    render(await getCurrentUser());
    const data = await apiRequest('/api/auth/me/submissions', { auth: true });
    renderContributions(data.submissions);
  }
  catch (error) { loadStatus.textContent = error.message; loadStatus.classList.add('error'); }
})();
