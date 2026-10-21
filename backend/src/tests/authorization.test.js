jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/Document', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/Permission', () => ({
  exists: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const User = require('../models/User');
const Document = require('../models/Document');
const Permission = require('../models/Permission');
const AuditLog = require('../models/AuditLog');
const TokenRevocation = require('../models/TokenRevocation');
const { authenticate } = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const { createDocumentAccess } = require('../middleware/documentAccess');
const errorHandler = require('../middleware/errorHandler');

const JWT_SECRET = 'authorization-test-secret-longer-than-32-bytes';
const OWNER_ID = '64b000000000000000000001';
const VIEWER_ID = '64b000000000000000000002';
const DOCUMENT_ID = '64b000000000000000000003';

function createTestApp() {
  const app = express();
  const { requireDocumentAccess, requireDocumentOwner } =
    createDocumentAccess();

  app.get('/admin', authenticate, authorizeRoles('admin'), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get(
    '/documents/:documentId/read',
    authenticate,
    requireDocumentAccess('read'),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.get(
    '/documents/:documentId/edit',
    authenticate,
    requireDocumentAccess('edit'),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.get(
    '/documents/:documentId/manage',
    authenticate,
    requireDocumentOwner,
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.use(errorHandler);
  return app;
}

function makeToken(userId, claims = {}) {
  return jwt.sign(claims, JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
  });
}

function makeUser(id, role = 'viewer') {
  return { _id: id, role, status: 'active' };
}

function authorizeUser(userId, user) {
  User.findById.mockImplementation(async (id) => (id === userId ? user : null));
  return `Bearer ${makeToken(userId)}`;
}

let app;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  app = createTestApp();
  Document.findById.mockResolvedValue({
    _id: DOCUMENT_ID,
    owner: OWNER_ID,
  });
  Permission.exists.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
  TokenRevocation.exists.mockResolvedValue(null);
});

describe('Authorization middleware', () => {
  it('rejects missing and invalid bearer tokens', async () => {
    const missing = await request(app).get('/admin');
    const invalid = await request(app)
      .get('/admin')
      .set('Authorization', 'Bearer invalid-token');

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(missing.body).toEqual({ error: 'Authentication required' });
    expect(invalid.body).toEqual({ error: 'Authentication required' });
  });

  it('uses the database role and denies non-admin users', async () => {
    const token = makeToken(VIEWER_ID, { role: 'admin' });
    User.findById.mockResolvedValue(makeUser(VIEWER_ID, 'viewer'));

    const response = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
  });

  it('allows an active administrator according to the database role', async () => {
    const adminId = '64b000000000000000000004';
    const token = authorizeUser(adminId, makeUser(adminId, 'admin'));

    const response = await request(app)
      .get('/admin')
      .set('Authorization', token);

    expect(response.status).toBe(200);
  });

  it('denies cross-user access when no document permission exists', async () => {
    const token = authorizeUser(VIEWER_ID, makeUser(VIEWER_ID));

    const response = await request(app)
      .get(`/documents/${DOCUMENT_ID}/read`)
      .set('Authorization', token);

    expect(response.status).toBe(403);
    expect(Permission.exists).toHaveBeenCalledWith({
      documentId: DOCUMENT_ID,
      userId: VIEWER_ID,
      access: { $in: ['read', 'edit'] },
    });
  });

  it('allows a read grant to read but not edit', async () => {
    const token = authorizeUser(VIEWER_ID, makeUser(VIEWER_ID));
    Permission.exists.mockImplementation(async ({ access }) =>
      access.$in.includes('read') ? { _id: 'grant' } : null,
    );

    const readResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/read`)
      .set('Authorization', token);
    const editResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/edit`)
      .set('Authorization', token);

    expect(readResponse.status).toBe(200);
    expect(editResponse.status).toBe(403);
  });

  it('allows edit grants to read and edit', async () => {
    const token = authorizeUser(VIEWER_ID, makeUser(VIEWER_ID));
    Permission.exists.mockResolvedValue({ _id: 'grant' });

    const readResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/read`)
      .set('Authorization', token);
    const editResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/edit`)
      .set('Authorization', token);

    expect(readResponse.status).toBe(200);
    expect(editResponse.status).toBe(200);
  });

  it('allows owners access and denies non-owners owner-only actions', async () => {
    const ownerToken = authorizeUser(OWNER_ID, makeUser(OWNER_ID, 'owner'));
    const ownerResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/manage`)
      .set('Authorization', ownerToken);

    expect(ownerResponse.status).toBe(200);
    expect(Permission.exists).not.toHaveBeenCalled();

    const viewerToken = authorizeUser(VIEWER_ID, makeUser(VIEWER_ID));
    const viewerResponse = await request(app)
      .get(`/documents/${DOCUMENT_ID}/manage`)
      .set('Authorization', viewerToken);

    expect(viewerResponse.status).toBe(403);
  });

  it('denies malformed and missing document IDs by default', async () => {
    const token = authorizeUser(VIEWER_ID, makeUser(VIEWER_ID));

    const malformed = await request(app)
      .get('/documents/not-an-object-id/read')
      .set('Authorization', token);
    Document.findById.mockResolvedValue(null);
    const missing = await request(app)
      .get(`/documents/${DOCUMENT_ID}/read`)
      .set('Authorization', token);

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(Permission.exists).not.toHaveBeenCalled();
  });
});
