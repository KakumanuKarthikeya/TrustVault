const path = require('node:path');

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = Object.freeze({
  '.pdf': {
    mimeType: 'application/pdf',
    matches(buffer) {
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    },
  },
  '.png': {
    mimeType: 'image/png',
    matches(buffer) {
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      );
    },
  },
  '.jpg': {
    mimeType: 'image/jpeg',
    matches(buffer) {
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    },
  },
  '.jpeg': {
    mimeType: 'image/jpeg',
    matches(buffer) {
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    },
  },
});

function validateOriginalFilename(filename) {
  if (
    typeof filename !== 'string' ||
    filename.length === 0 ||
    Buffer.byteLength(filename, 'utf8') > 255 ||
    /[\\/\u0000-\u001f\u007f]/.test(filename) ||
    filename === '.' ||
    filename === '..' ||
    path.basename(filename) !== filename
  ) {
    return null;
  }

  return filename;
}

function detectAllowedFile(file) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length === 0 ||
    file.buffer.length > MAX_FILE_SIZE
  ) {
    return null;
  }

  const filename = validateOriginalFilename(file.originalname);
  if (!filename) {
    return null;
  }

  const extension = path.extname(filename).toLowerCase();
  const type = ALLOWED_TYPES[extension];
  if (
    !type ||
    file.mimetype !== type.mimeType ||
    !type.matches(file.buffer)
  ) {
    return null;
  }

  return { filename, extension, mimeType: type.mimeType };
}

module.exports = {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  detectAllowedFile,
  validateOriginalFilename,
};
