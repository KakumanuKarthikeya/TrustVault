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

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const AuditLog = require('../models/AuditLog');
const TokenRevocation = require('../models/TokenRevocation');
const User = require('../models/User');
const app = require('../app');

const JWT_SECRET = 'audit-log-test-secret-longer-than-32-bytes';
const ADMIN_ID = '64b000000000000000000010';
const VIEWER_ID = '64b000000000000000000011';
const OWNER_ID = '64b000000000000000000012';

function tokenFor(userId, claims = {}) {
  return jwt.sign(claims, JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
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
  mongoose.connection.readyState = 1;
  jest.clearAllMocks();
  User.findById.mockImplementation(async (id) => ({
    _id: id,
    role: id === ADMIN_ID ? 'admin' : id === OWNER_ID ? 'owner' : 'viewer',
    status: 'active',
  }));
  TokenRevocation.exists.mockResolvedValue(null);
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
    const ownerResponse = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);
    const forgedAdminResponse = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${tokenFor(VIEWER_ID, { role: 'admin' })}`);
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
    expect(ownerResponse.status).toBe(403);
    expect(forgedAdminResponse.status).toBe(403);
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

  it('filters audit records by action and inclusive UTC date range', async () => {
    const query = mockAuditQuery([]);
    const response = await request(app)
      .get('/api/audit-logs?action=auth.user.status&from=2026-10-20&to=2026-10-21&limit=100')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`);

    expect(response.status).toBe(200);
    expect(AuditLog.find).toHaveBeenCalledWith({
      action: 'auth.user.status',
      timestamp: {
        $gte: new Date('2026-10-20T00:00:00.000Z'),
        $lt: new Date('2026-10-22T00:00:00.000Z'),
      },
    });
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it('accepts password reset actions as audit filters', async () => {
    mockAuditQuery([]);
    const authorization = `Bearer ${tokenFor(ADMIN_ID)}`;

    const requested = await request(app)
      .get('/api/audit-logs?action=auth.password_reset.requested')
      .set('Authorization', authorization);
    const completed = await request(app)
      .get('/api/audit-logs?action=auth.password_reset.completed')
      .set('Authorization', authorization);

    expect(requested.status).toBe(200);
    expect(completed.status).toBe(200);
    expect(AuditLog.find).toHaveBeenNthCalledWith(1, {
      action: 'auth.password_reset.requested',
    });
    expect(AuditLog.find).toHaveBeenNthCalledWith(2, {
      action: 'auth.password_reset.completed',
    });
  });

  it('rejects invalid audit action and date filters', async () => {
    const authorization = `Bearer ${tokenFor(ADMIN_ID)}`;
    const action = await request(app)
      .get('/api/audit-logs?action=unknown')
      .set('Authorization', authorization);
    const date = await request(app)
      .get('/api/audit-logs?from=2026-02-30')
      .set('Authorization', authorization);

    expect(action.status).toBe(400);
    expect(action.body).toEqual({ error: 'Invalid audit history action' });
    expect(date.status).toBe(400);
    expect(date.body).toEqual({ error: 'Invalid audit history date range' });
    expect(AuditLog.find).not.toHaveBeenCalled();
  });
});
