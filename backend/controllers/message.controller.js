const service = require('../services/message.service');
const repository = require('../repositories/message.repository');
const database = require('../config/database');
const createHttpError = require('../utils/httpError');
const { sendSuccess } = require('../utils/apiResponse');

function handle(work) { return async (request, response, next) => {
  try { return await work(request, response); }
  catch (error) { return next(database.isConnectivityError(error) ? createHttpError(503, 'Messaging is temporarily unavailable') : error); }
}; }
const conversations = handle(async (req, res) => sendSuccess(res, 200, 'Conversations retrieved',
  { conversations: await service.listConversations(req.user.userId) }));
const history = handle(async (req, res) => sendSuccess(res, 200, 'Messages retrieved',
  await service.history(req.user.userId, req.params.userId, req.query.beforeMessageId)));
const send = handle(async (req, res) => sendSuccess(res, 201, 'Message sent',
  { message: await service.send(req.user.userId, req.params.userId, req.body?.messageBody) }));
const edit = handle(async (req, res) => sendSuccess(res, 200, 'Message updated',
  { message: await service.edit(req.user.userId, req.params.messageId, req.body?.messageBody) }));
const remove = handle(async (req, res) => sendSuccess(res, 200, 'Message deleted',
  { message: await service.remove(req.user.userId, req.params.messageId) }));
const unreadCount = handle(async (req, res) => sendSuccess(res, 200, 'Unread count retrieved',
  { count: await repository.unreadCount(req.user.userId) }));
const contacts = handle(async (req, res) => sendSuccess(res, 200, 'Company contacts retrieved',
  { contacts: await service.companyContacts(req.params.companyId) }));
const profile = handle(async (req, res) => sendSuccess(res, 200, 'User profile retrieved',
  { user: await service.userProfile(req.params.userId) }));
module.exports = { conversations, history, send, edit, remove, unreadCount, contacts, profile };
