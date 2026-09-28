const repository = require('../repositories/message.repository');
const storage = require('../config/supabase-storage');
const createHttpError = require('../utils/httpError');
const professionalProfiles = require('../repositories/professional-profile.repository');

function id(value, label = 'User ID') {
  if (!/^\d+$/.test(String(value))) throw createHttpError(400, `Invalid ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw createHttpError(400, `Invalid ${label}`);
  return parsed;
}
function body(value) {
  if (typeof value !== 'string') throw createHttpError(400, 'Message must be text');
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized || Array.from(normalized).length > 2000) throw createHttpError(400, 'Message must contain 1 to 2000 characters');
  return normalized;
}
function safeProfile(user) {
  return { userId: user.userId, fullName: user.fullName,
    displayLabel: user.accountRole === 'COMPANY_REPRESENTATIVE' ? 'Company representative' : 'Saple member',
    avatarUrl: storage.publicUrl('avatar', user.avatarPath, user.updatedAt || user.avatarUpdatedAt),
    headline: user.headline || null, bio: user.bio || null };
}
async function userProfile(value, { includeSections = false } = {}) {
  const user = await repository.profile(id(value));
  if (!user) throw createHttpError(404, 'User not found');
  return includeSections
    ? { ...safeProfile(user), ...await professionalProfiles.listSections(user.userId) }
    : safeProfile(user);
}
async function listConversations(userId) {
  return (await repository.conversations(userId)).map((item) => ({ ...safeProfile(item),
    lastMessagePreview: item.lastMessagePreview, lastMessageAt: item.lastMessageAt,
    lastMessageSenderUserId: item.lastMessageSenderUserId, unreadCount: item.unreadCount }));
}
async function history(userId, peerValue, beforeValue) {
  const peerId = id(peerValue);
  if (peerId === userId) throw createHttpError(400, 'You cannot message yourself');
  const user = await userProfile(peerId);
  const before = beforeValue === undefined ? null : id(beforeValue, 'message ID');
  return { user, ...await repository.history(userId, peerId, before) };
}
async function send(userId, peerValue, value) {
  const peerId = id(peerValue);
  if (peerId === userId) throw createHttpError(400, 'You cannot message yourself');
  const normalized = body(value);
  const message = await repository.send(userId, peerId, normalized);
  if (!message) throw createHttpError(404, 'Recipient not found');
  return message;
}
async function edit(userId, messageValue, value) {
  const message = await repository.edit(userId, id(messageValue, 'message ID'), body(value));
  if (!message) throw createHttpError(404, 'Message not found');
  return message;
}
async function remove(userId, messageValue) {
  const message = await repository.remove(userId, id(messageValue, 'message ID'));
  if (!message) throw createHttpError(404, 'Message not found');
  return message;
}
async function companyContacts(value) {
  return (await repository.companyContacts(id(value, 'company ID'))).map((item) => ({
    userId: item.userId, fullName: item.fullName, jobTitle: item.jobTitle,
    avatarUrl: storage.publicUrl('avatar', item.avatarPath, item.updatedAt)
  }));
}
module.exports = { id, body, userProfile, listConversations, history, send, edit, remove, companyContacts };
