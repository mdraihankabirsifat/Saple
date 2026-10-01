const multer = require('multer');
const createHttpError = require('../utils/httpError');

// Optional PDF resume on a job application.
//
// Used only on POST /api/jobs/:jobId/applications. The file is kept in memory
// (it goes straight into PostgreSQL, never to disk), limited to 2 MB and to a
// single file in the "resume" field; any other file field is refused. A JSON
// request without a file passes straight through, so older clients still work.
// The service checks the type, name and PDF signature again.

const MAX_RESUME_BYTES = 2 * 1024 * 1024; // 2097152

const parse = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 5, fieldSize: 16 * 1024 }
}).single('resume');

function resumeUpload(request, response, next) {
  return parse(request, response, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(createHttpError(413, 'Resume must be 2 MB or smaller.'));
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(createHttpError(400, 'Attach one PDF resume in the resume field only.'));
    }
    return next(createHttpError(400, 'The application could not be read. Please try again.'));
  });
}

module.exports = { resumeUpload, MAX_RESUME_BYTES };
