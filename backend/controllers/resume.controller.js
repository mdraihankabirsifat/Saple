const resumeService = require('../services/resume.service');
const { sendSuccess } = require('../utils/apiResponse');

function handle(work) {
  return async (request, response, next) => {
    try { return await work(request, response); } catch (error) { return next(error); }
  };
}

const status = handle(async (req, res) => sendSuccess(res, 200, 'Resume generator status retrieved',
  await resumeService.getStatus(req.user.userId)));

const generate = handle(async (req, res) => sendSuccess(res, 200, 'Resume generated',
  await resumeService.generateResume(req.user.userId, req.body)));

// Saple's official PDF export (Premium and trial only, enforced by the route).
// The file is built from the posted resume and streamed; nothing is stored.
const pdf = handle(async (req, res) => {
  const { fileName, content } = resumeService.resumePdf(req.body);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(content.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).end(content);
});

module.exports = { status, generate, pdf };
