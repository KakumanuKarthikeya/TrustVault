jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/Document', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../models/Permission', () => ({
  exists: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../services/privateFileStorage', () => ({
  getFilePath: jest.fn(),
  removeFile: jest.fn(),
  storeFile: jest.fn(),
}));

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const privateFileStorage = require('../services/privateFileStorage');
const app = require('../app');

const JWT_SECRET = 'document-test-secret-that-is-longer-than-32-bytes';
const OWNER_ID = '64b000000000000000000001';
const OTHER_USER_ID = '64b000000000000000000002';
const DOCUMENT_ID = '64b000000000000000000003';
const STORAGE_KEY = `${'a'.repeat(64)}.pdf`;
const PDF_BUFFER = Buffer.from('%PDF-1.7\nTrustVault test fixture');

let records;
let grants;
let temporaryDirectory;
let downloadablePath;

function makeUser(userId, role = 'owner') {
  return { _id: userId, role, status: 'active' };
}

function makeDocument(values = {}) {
  return {
    _id: DOCUMENT_ID,
    owner: OWNER_ID,
    originalFilename: 'contract.pdf',
    storageKey: STORAGE_KEY,
    name: 'contract.pdf',
    category: 'general',
    description: '',
    mimeType: 'application/pdf',
    size: PDF_BUFFER.length,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn(async function save() {
      this.updatedAt = new Date();
      return this;
    }),
    deleteOne: jest.fn(async function deleteOne() {
      records = records.filter((record) => record._id !== this._id);
      return this;
    }),
    ...values,
  };
}

function tokenFor(userId) {
  return jwt.sign({}, JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
  });
}

function authenticateAs(userId, role = 'owner') {
  User.findById.mockImplementation(async (id) =>
    id === userId ? makeUser(userId, role) : null,
  );
  return `Bearer ${tokenFor(userId)}`;
}

function installDocumentMocks() {
  Document.create.mockImplementation(async (values) => {
    const document = makeDocument({
      ...values,
      _id: DOCUMENT_ID,
      save: jest.fn(async function save() {
        this.updatedAt = new Date();
        return this;
      }),
    });
    records.push(document);
    return document;
  });
  Document.findById.mockImplementation((id) => ({
    select: jest.fn(async () => records.find((record) => record._id === id) || null),
  }));
  Document.find.mockImplementation((filter) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => {
      const scope = filter.$and.find((part) => part.$or);
      const ownerScope = scope.$or[0].owner;
      const permissionScope = scope.$or[1];
      return records.filter((record) => {
        const ownerMatch = record.owner === ownerScope;
        const sharedMatch =
          permissionScope &&
          permissionScope._id.$in.includes(record._id);
        const scopeMatch = ownerMatch || sharedMatch;
        const filtersMatch = filter.$and.every((part) => {
          if (part.$or) return true;
          if (part.owner) return part.owner === record.owner;
          if (part.category) return part.category === record.category;
          if (part.name) {
            return new RegExp(part.name.$regex, part.name.$options).test(
              record.name,
            );
          }
          return true;
        });
        return scopeMatch && filtersMatch;
      });
    }),
  }));
  Permission.exists.mockResolvedValue(null);
  Permission.find.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(grants),
  });
  privateFileStorage.storeFile.mockResolvedValue(STORAGE_KEY);
  privateFileStorage.getFilePath.mockResolvedValue(downloadablePath);
  privateFileStorage.removeFile.mockResolvedValue(undefined);
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'trustvault-doc-test-'),
  );
  downloadablePath = path.join(temporaryDirectory, 'private-document.pdf');
  await fs.writeFile(downloadablePath, PDF_BUFFER);
});

afterAll(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  records = [];
  grants = [];
  installDocumentMocks();
});

describe('Document API', () => {
  it('uploads an allowlisted file and does not expose its storage key', async () => {
    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', authenticateAs(OWNER_ID))
      .field('category', 'contracts')
      .field('description', 'Signed agreement')
      .attach('file', PDF_BUFFER, {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(response.body.document.ownerId).toBe(OWNER_ID);
    expect(response.body.document.category).toBe('contracts');
    expect(response.body.document.storageKey).toBeUndefined();
    expect(privateFileStorage.storeFile).toHaveBeenCalledWith(
      PDF_BUFFER,
      '.pdf',
    );
    expect(Document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: OWNER_ID,
        storageKey: STORAGE_KEY,
        mimeType: 'application/pdf',
      }),
    );
  });

  it('rejects content whose signature does not match its declared type', async () => {
    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', authenticateAs(OWNER_ID))
      .attach('file', Buffer.from('not a PDF'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid document upload' });
    expect(privateFileStorage.storeFile).not.toHaveBeenCalled();
    expect(Document.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported MIME types', async () => {
    const unsupported = await request(app)
      .post('/api/documents')
      .set('Authorization', authenticateAs(OWNER_ID))
      .attach('file', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(unsupported.status).toBe(400);
    expect(privateFileStorage.storeFile).not.toHaveBeenCalled();
  });

  it('rejects oversized files', async () => {
    const response = await request(app)
      .post('/api/documents')
      .set('Authorization', authenticateAs(OWNER_ID))
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 0x41), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'Uploaded file is too large' });
    expect(Document.create).not.toHaveBeenCalled();
  });

  it('denies another user metadata read and download without permission', async () => {
    records.push(makeDocument());
    const authorization = authenticateAs(OTHER_USER_ID, 'viewer');

    const metadata = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authorization);
    const download = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', authorization);

    expect(metadata.status).toBe(403);
    expect(download.status).toBe(403);
    expect(privateFileStorage.getFilePath).not.toHaveBeenCalled();
  });

  it('lists only owned or explicitly shared documents and applies search filters', async () => {
    records.push(
      makeDocument({ name: 'My contract', category: 'contracts' }),
      makeDocument({
        _id: '64b000000000000000000004',
        owner: OTHER_USER_ID,
        name: 'Private budget',
        category: 'finance',
      }),
    );

    const response = await request(app)
      .get('/api/documents?name=contract&category=contracts')
      .set('Authorization', authenticateAs(OWNER_ID));

    expect(response.status).toBe(200);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0].name).toBe('My contract');
    expect(Permission.find).toHaveBeenCalledWith({
      userId: OWNER_ID,
      access: { $in: ['read', 'edit'] },
    });
    expect(Document.find).toHaveBeenCalledWith({
      $and: expect.arrayContaining([
        {
          $or: [{ owner: OWNER_ID }],
        },
        { name: { $regex: 'contract', $options: 'i' } },
        { category: 'contracts' },
      ]),
    });
  });

  it('denies another user metadata updates and deletion without permission', async () => {
    records.push(makeDocument());
    const authorization = authenticateAs(OTHER_USER_ID, 'viewer');

    const update = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authorization)
      .send({ name: 'Changed name' });
    const deletion = await request(app)
      .delete(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authorization);

    expect(update.status).toBe(403);
    expect(deletion.status).toBe(403);
    expect(records).toHaveLength(1);
    expect(privateFileStorage.removeFile).not.toHaveBeenCalled();
  });

  it('allows a current read grant to download, but not edit metadata', async () => {
    records.push(makeDocument());
    Permission.exists.mockResolvedValue({ _id: 'permission' });
    const authorization = authenticateAs(OTHER_USER_ID, 'viewer');

    const download = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', authorization);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/^application\/pdf/);
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(privateFileStorage.getFilePath).toHaveBeenCalledWith(STORAGE_KEY);

    Permission.exists.mockResolvedValue(null);
    const update = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authenticateAs(OTHER_USER_ID, 'viewer'))
      .send({ name: 'Changed name' });
    expect(update.status).toBe(403);
  });

  it('allows owners to update metadata and delete their own document', async () => {
    const document = makeDocument();
    records.push(document);
    const authorization = authenticateAs(OWNER_ID);

    const update = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authorization)
      .send({ name: 'Updated contract', description: 'Updated notes' });

    expect(update.status).toBe(200);
    expect(document.name).toBe('Updated contract');
    expect(update.body.document.storageKey).toBeUndefined();

    const deletion = await request(app)
      .delete(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authenticateAs(OWNER_ID));
    expect(deletion.status).toBe(204);
    expect(privateFileStorage.removeFile).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('returns not found for missing documents and rejects owner reassignment', async () => {
    const authorization = authenticateAs(OWNER_ID);
    const missing = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authorization);

    records.push(makeDocument());
    const reassignment = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}`)
      .set('Authorization', authenticateAs(OWNER_ID))
      .send({ owner: OTHER_USER_ID });

    expect(missing.status).toBe(404);
    expect(reassignment.status).toBe(400);
    expect(records[0].owner).toBe(OWNER_ID);
  });
});
