const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STORAGE_KEY_PATTERN = /^[a-f0-9]{64}\.(pdf|png|jpg|jpeg)$/;

function getStorageDirectory() {
  const configuredDirectory = process.env.PRIVATE_UPLOAD_DIR || 'private-uploads';
  const backendDirectory = path.resolve(__dirname, '..', '..');
  const directory = path.isAbsolute(configuredDirectory)
    ? path.resolve(configuredDirectory)
    : path.resolve(backendDirectory, configuredDirectory);
  const publicDirectory = path.join(backendDirectory, 'public');
  const relativeToPublic = path.relative(publicDirectory, directory);

  if (
    relativeToPublic === '' ||
    (!relativeToPublic.startsWith('..') && !path.isAbsolute(relativeToPublic))
  ) {
    throw new Error('Private storage cannot be inside the public directory');
  }

  return directory;
}

function resolveStoragePath(storageKey) {
  if (
    typeof storageKey !== 'string' ||
    !STORAGE_KEY_PATTERN.test(storageKey)
  ) {
    throw new TypeError('Invalid storage key');
  }

  const directory = getStorageDirectory();
  const resolvedPath = path.resolve(directory, storageKey);
  if (path.dirname(resolvedPath) !== directory) {
    throw new TypeError('Invalid storage key');
  }

  return resolvedPath;
}

async function storeFile(buffer, extension) {
  if (
    !Buffer.isBuffer(buffer) ||
    !['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)
  ) {
    throw new TypeError('Invalid file data');
  }

  const directory = getStorageDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  const storageKey = `${crypto.randomBytes(32).toString('hex')}${extension}`;
  const filePath = resolveStoragePath(storageKey);
  await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });

  return storageKey;
}

async function removeFile(storageKey) {
  await fs.unlink(resolveStoragePath(storageKey)).catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
}

async function getFilePath(storageKey) {
  const filePath = resolveStoragePath(storageKey);
  await fs.stat(filePath);
  return filePath;
}

module.exports = { getFilePath, getStorageDirectory, removeFile, storeFile };
