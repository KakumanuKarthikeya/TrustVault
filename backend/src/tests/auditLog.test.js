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
  find: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const app = require('../app');

const JWT_SECRET = 'audit-log-test-secret-longer-than-32-bytes';
const ADMIN_ID = '64b000000000000000000010';
const VIEWER_ID = '64b000000000000000000011';

function tokenFor(userId) {
  return jwt.sign({}, JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
  });
}

function mockAuditQuery(entries) {
  const query = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(entries),
  };
  AuditLog.find.mockReturnValue(query);
  return query;
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockImplementation(async (id) => ({
    _id: id,
    role: id === ADMIN_ID ? 'admin' : 'viewer',
    status: 'active',
  }));
});

describe('Audit history API', () => {
  it('restricts audit history to active administrators', async () => {
    const entries = [
      {
        action: 'document.upload',
        outcome: 'success',
        timestamp: new Date('2026-10-21T00:00:00.000Z'),
      },
    ];
    const query = mockAuditQuery(entries);

    const adminResponse = await request(app)
      .get('/api/audit-logs?limit=1')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`);
    const viewerResponse = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${tokenFor(VIEWER_ID)}`);
    const anonymousResponse = await request(app).get('/api/audit-logs');

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.auditLogs).toEqual([
      expect.objectContaining({ action: 'document.upload', outcome: 'success' }),
    ]);
    expect(query.sort).toHaveBeenCalledWith({ timestamp: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.select).toHaveBeenCalledWith(
      'actorUserId action documentId targetUserId permissionType timestamp outcome metadata',
    );
    expect(viewerResponse.status).toBe(403);
    expect(anonymousResponse.status).toBe(401);
    expect(AuditLog.find).toHaveBeenCalledTimes(1);
  });

  it('does not expose audit-log modification or deletion through the API', async () => {
    const writeHeaders = {
      Authorization: `Bearer ${tokenFor(VIEWER_ID)}`,
    };
    const update = await request(app)
      .put('/api/audit-logs/64b000000000000000000012')
      .set(writeHeaders)
      .send({ outcome: 'success' });
    const deletion = await request(app)
      .delete('/api/audit-logs/64b000000000000000000012')
      .set(writeHeaders);

    expect(update.status).toBe(403);
    expect(deletion.status).toBe(403);
    expect(AuditLog.create).not.toHaveBeenCalled();
    expect(AuditLog.find).not.toHaveBeenCalled();
  });
});
