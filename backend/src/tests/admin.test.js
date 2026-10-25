jest.mock('../models/User', () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/Document', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  countDocuments: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');
const TokenRevocation = require('../models/TokenRevocation');
const app = require('../app');

const JWT_SECRET = 'admin-test-secret-that-is-longer-than-32-bytes';
const ADMIN_ID = '64b000000000000000000010';
const OWNER_ID = '64b000000000000000000011';
const TARGET_ID = '64b000000000000000000012';
let users;

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

function makeUser(id, role, status = 'active') {
  return {
    _id: id,
    name: id === ADMIN_ID ? 'Admin User' : 'Taylor User',
    email: `${id.slice(-2)}@example.com`,
    role,
    status,
    passwordHash: 'must-not-be-returned',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    save: jest.fn(async function save() { return this; }),
  };
}

function queryFor(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  mongoose.connection.readyState = 1;
  jest.clearAllMocks();
  users = new Map([
    [ADMIN_ID, makeUser(ADMIN_ID, 'admin')],
    [OWNER_ID, makeUser(OWNER_ID, 'owner')],
    [TARGET_ID, makeUser(TARGET_ID, 'owner')],
  ]);
  User.findById.mockImplementation(async (id) => users.get(String(id)) || null);
  User.findOne.mockImplementation((filter) => ({
    select: jest.fn().mockResolvedValue(
      [...users.values()].find((user) => user.email === filter.email) || null,
    ),
  }));
  User.countDocuments.mockResolvedValue(3);
  Document.countDocuments.mockResolvedValue(7);
  AuditLog.countDocuments.mockResolvedValue(12);
  AuditLog.create.mockResolvedValue({});
  AuditLog.find.mockReturnValue(queryFor([]));
  TokenRevocation.exists.mockResolvedValue(null);
});

describe('Admin API', () => {
  it('allows an active administrator to log in and retrieve backend dashboard statistics', async () => {
    const password = crypto.randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 4);
    const admin = users.get(ADMIN_ID);
    admin.passwordHash = passwordHash;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password });

    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');
    expect(login.body.user.passwordHash).toBeUndefined();

    const dashboard = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.summary).toEqual({
      totalUsers: 3,
      activeUsers: 3,
      totalDocuments: 7,
      recentAuditEvents: 12,
    });
  });

  it('returns real summary counts and only recent audit records to an active admin', async () => {
    const auditEvents = [{ action: 'document.upload', outcome: 'success' }];
    const query = queryFor(auditEvents);
    AuditLog.find.mockReturnValue(query);

    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID, { role: 'owner' })}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      summary: {
        totalUsers: 3,
        activeUsers: 3,
        totalDocuments: 7,
        recentAuditEvents: 12,
      },
      auditEvents,
    });
    expect(User.countDocuments).toHaveBeenNthCalledWith(1);
    expect(User.countDocuments).toHaveBeenNthCalledWith(2, { status: 'active' });
    expect(Document.countDocuments).toHaveBeenCalledWith();
    expect(AuditLog.countDocuments).toHaveBeenCalledWith({
      timestamp: { $gte: expect.any(Date) },
    });
    expect(query.select).toHaveBeenCalledWith(
      'actorUserId action documentId targetUserId permissionType timestamp outcome metadata',
    );
  });

  it('requires authentication and the current database admin role for every admin route', async () => {
    const anonymous = await request(app).get('/api/admin/users');
    const owner = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor(OWNER_ID, { role: 'admin' })}`);
    const forgedAdmin = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenFor(OWNER_ID, { role: 'admin' })}`);

    expect(anonymous.status).toBe(401);
    expect(owner.status).toBe(403);
    expect(forgedAdmin.status).toBe(403);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('paginates users and returns only approved account fields', async () => {
    const account = users.get(TARGET_ID);
    const query = queryFor([account]);
    User.find.mockReturnValue(query);

    const response = await request(app)
      .get('/api/admin/users?page=2&limit=1')
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: [{
        id: TARGET_ID,
        name: account.name,
        email: account.email,
        role: 'owner',
        status: 'active',
        createdAt: account.createdAt.toISOString(),
      }],
      pagination: { page: 2, limit: 1, total: 3, pages: 3 },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(query.skip).toHaveBeenCalledWith(1);
    expect(query.select).toHaveBeenCalledWith('_id name email role status createdAt');
  });

  it('denies account listing to owners and unauthenticated requests', async () => {
    const ownerResponse = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`);
    const anonymousResponse = await request(app).get('/api/admin/users');

    expect(ownerResponse.status).toBe(403);
    expect(anonymousResponse.status).toBe(401);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('allows admins to disable and reactivate owner accounts', async () => {
    const target = users.get(TARGET_ID);
    const authorization = `Bearer ${tokenFor(ADMIN_ID)}`;

    const disable = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', authorization)
      .send({ status: 'disabled' });
    expect(disable.status).toBe(200);
    expect(disable.body.user).toMatchObject({
      id: TARGET_ID,
      role: 'owner',
      status: 'disabled',
    });
    expect(target.status).toBe('disabled');
    expect(AuditLog.create).toHaveBeenCalledWith({
      actorUserId: ADMIN_ID,
      action: 'auth.user.status',
      targetUserId: TARGET_ID,
      outcome: 'success',
      metadata: { accountStatus: 'disabled' },
    });

    const reactivate = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', authorization)
      .send({ status: 'active' });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.user.status).toBe('active');
    expect(target.status).toBe('active');
  });

  it('prevents owners, self, and admin targets from changing account status', async () => {
    const ownerAttempt = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(OWNER_ID)}`)
      .send({ status: 'disabled' });
    const selfAttempt = await request(app)
      .patch(`/api/admin/users/${ADMIN_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`)
      .send({ status: 'disabled' });
    const adminTarget = makeUser(TARGET_ID, 'admin');
    User.findById.mockImplementation(async (id) =>
      String(id) === ADMIN_ID ? users.get(ADMIN_ID) : adminTarget,
    );
    const anotherAdminAttempt = await request(app)
      .patch(`/api/admin/users/${TARGET_ID}/status`)
      .set('Authorization', `Bearer ${tokenFor(ADMIN_ID)}`)
      .send({ status: 'disabled' });

    expect(ownerAttempt.status).toBe(403);
    expect(selfAttempt.status).toBe(400);
    expect(anotherAdminAttempt.status).toBe(403);
    expect(adminTarget.status).toBe('active');
    expect(adminTarget.save).not.toHaveBeenCalled();
  });
});
