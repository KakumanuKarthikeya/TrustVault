const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const privateFileStorage = require('../services/privateFileStorage');

describe('private file storage', () => {
  let storageDirectory;
  let originalDirectory;

  beforeAll(async () => {
    originalDirectory = process.env.PRIVATE_UPLOAD_DIR;
    storageDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'trustvault-storage-test-'),
    );
    process.env.PRIVATE_UPLOAD_DIR = storageDirectory;
  });

  afterAll(async () => {
    if (originalDirectory === undefined) {
      delete process.env.PRIVATE_UPLOAD_DIR;
    } else {
      process.env.PRIVATE_UPLOAD_DIR = originalDirectory;
    }
    await fs.rm(storageDirectory, { recursive: true, force: true });
  });

  it('stores files using an unpredictable storage key and removes them safely', async () => {
    const bytes = Buffer.from('%PDF-1.7 private fixture');
    const key = await privateFileStorage.storeFile(bytes, '.pdf');

    expect(key).toMatch(/^[a-f0-9]{64}\.pdf$/);
    const filePath = await privateFileStorage.getFilePath(key);
    await expect(fs.readFile(filePath)).resolves.toEqual(bytes);

    await privateFileStorage.removeFile(key);
    await expect(privateFileStorage.getFilePath(key)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects traversal keys and public-directory storage configuration', async () => {
    await expect(
      privateFileStorage.getFilePath('..\\..\\outside.pdf'),
    ).rejects.toThrow('Invalid storage key');

    const original = process.env.PRIVATE_UPLOAD_DIR;
    process.env.PRIVATE_UPLOAD_DIR = path.resolve(
      __dirname,
      '..',
      '..',
      'public',
      'uploads',
    );
    try {
      await expect(
        privateFileStorage.storeFile(Buffer.from('x'), '.pdf'),
      ).rejects.toThrow('Private storage cannot be inside the public directory');
    } finally {
      process.env.PRIVATE_UPLOAD_DIR = original;
    }
  });
});
