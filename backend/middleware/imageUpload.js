const multer = require('multer');
const createHttpError = require('../utils/httpError');

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
function isValidImage(file) {
  const bytes = file?.buffer;
  if (!bytes?.length || !allowed.has(file.mimetype)) return false;
  if (file.mimetype === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
function imageUpload(field, maxBytes) {
  const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0 },
    fileFilter: (_request, file, done) => done(null, allowed.has(file.mimetype)) }).single(field);
  return (request, response, next) => parse(request, response, (error) => {
    if (error) return next(createHttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'Invalid or oversized image upload'));
    if (!isValidImage(request.file)) return next(createHttpError(400, 'Upload a JPEG, PNG or WebP image'));
    return next();
  });
}
module.exports = { imageUpload, isValidImage };
