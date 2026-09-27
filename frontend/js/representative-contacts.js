import { apiRequest } from './api.js';
import { getStoredUser, isAuthenticated } from './auth.js';
import { el } from './ui.js';

export async function mountRepresentativeContacts(host, companyId) {
  if (!host || !isAuthenticated() || !Number.isSafeInteger(Number(companyId))) return;
  let contacts;
  try {
    const data = await apiRequest(`/api/messages/company/${companyId}/contacts`, { auth: true });
    contacts = data.contacts.filter((contact) => contact.userId !== getStoredUser()?.userId);
  } catch { return; }
  if (!contacts.length) return;
  const container = el('div', { className: 'representative-contacts' });
  const label = el('p', { text: 'Questions about this company or role? Contact an active Saple representative.' });
  container.append(label);
  async function message(userId) {
    const { mountMessages, openConversation } = await import('./messages.js');
    mountMessages(); openConversation(userId);
  }
  if (contacts.length === 1) {
    const contact = contacts[0];
    const button = el('button', { className: 'button button-secondary button-small', text: `Message ${contact.fullName}`, attrs: { type: 'button' } });
    button.addEventListener('click', () => message(contact.userId));
    container.append(button);
  } else {
    const chooser = el('select', { className: 'input', attrs: { 'aria-label': 'Choose a company representative' } }, [
      el('option', { text: 'Choose a representative', attrs: { value: '' } }),
      ...contacts.map((contact) => el('option', { text: `${contact.fullName}${contact.jobTitle ? ` · ${contact.jobTitle}` : ''}`, attrs: { value: contact.userId } }))
    ]);
    const button = el('button', { className: 'button button-secondary button-small', text: 'Message representative', attrs: { type: 'button' } });
    button.addEventListener('click', () => { if (chooser.value) message(Number(chooser.value)); });
    container.append(chooser, button);
  }
  host.append(container);
}
