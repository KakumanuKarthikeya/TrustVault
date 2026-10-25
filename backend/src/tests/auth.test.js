jest.mock('../models/User', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  create: jest.fn(),
  exists: jest.fn(),
}));

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const TokenRevocation = require('../models/TokenRevocation');
const app = require('../app');

const userId = '64b000000000000000000001';
const testSecret = 'test-only-secret-with-at-least-32-characters';
let users;
let revokedTokens;

function makeUser(values, id = userId) {
  return {
    _id: id,
    name: values.name,
    email: values.email.trim().toLowerCase(),
    passwordHash: values.passwordHash,
    role: values.role || 'owner',
    status: values.status || 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function tokenFor(id) {
  return jwt.sign({}, testSecret, {
    algorithm: 'HS256',
    subject: id,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = testSecret;
});

beforeEach(() => {
  mongoose.connection.readyState = 1;
  users = [];
  revokedTokens = new Map();
  jest.clearAllMocks();
  AuditLog.create.mockResolvedValue({});
  TokenRevocation.create.mockImplementation(async (record) => {
    revokedTokens.set(record.tokenIdHash, record.expiresAt);
    return record;
  });
  TokenRevocation.exists.mockImplementation(async ({ tokenIdHash, expiresAt }) =>
    revokedTokens.get(tokenIdHash) > expiresAt.$gt ? { _id: 'revoked' } : null,
  );

  User.create.mockImplementation(async (values) => {
    if (users.some((user) => user.email === values.email)) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    const user = makeUser(values);
    users.push(user);
    return user;
  });
  User.findOne.mockImplementation((filter) => ({
    select: jest.fn().mockResolvedValue(
      users.find((user) => user.email === filter.email) || null,
    ),
  }));
  User.findById.mockImplementation(async (id) =>
    users.find((user) => user._id === id) || null,
  );
});

describe('Authentication API', () => {
  const registration = {
    name: 'Taylor User',
    email: 'Taylor.User@example.com',
    password: 'StrongPassword123!',
  };

  it('registers a user with a normalized email and hashed password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(registration);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('taylor.user@example.com');
    expect(response.body.user.role).toBe('owner');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.token).toEqual(expect.any(String));
    expect(users).toHaveLength(1);
    expect(users[0].passwordHash).not.toBe(registration.password);
    await expect(
      bcrypt.compare(registration.password, users[0].passwordHash),
    ).resolves.toBe(true);
  });

  it('rejects duplicate email addresses', async () => {
    await request(app).post('/api/auth/register').send(registration);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, email: registration.email.toLowerCase() });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Email already registered' });
  });

  it('rejects invalid input without returning validation details', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request body' });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects attempted administrator-role escalation', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...registration, role: 'admin' });

    expect(response.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('fails safely when the JWT signing secret is unavailable', async () => {
    const configuredSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const response = await request(app)
        .post('/api/auth/register')
        .send(registration);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: 'Authentication unavailable',
      });
      expect(User.create).not.toHaveBeenCalled();
    } finally {
      process.env.JWT_SECRET = configuredSecret;
    }
  });

  it('returns a generic error for an incorrect password', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: 'WrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid email or password' });
    expect(AuditLog.create).toHaveBeenCalledWith({
      action: 'auth.login.failed',
      outcome: 'denied',
      metadata: { reason: 'invalid_credentials' },
    });
  });

  it('logs in successfully and returns a token without a password hash', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: registration.password });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.password).toBeUndefined();
  });

  it('protects /me and returns the authenticated user', async () => {
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: registration.email, password: registration.password });

    const unauthorized = await request(app).get('/api/auth/me');
    expect(unauthorized.status).toBe(401);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(registration.email.toLowerCase());
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('looks up an active recipient by exact email and returns only minimum details', async () => {
    const recipientId = '64b000000000000000000002';
    users.push(
      makeUser({ ...registration, passwordHash: 'owner-hash' }),
      makeUser(
        {
          name: 'Recipient User',
          email: 'recipient@example.com',
          passwordHash: 'recipient-hash',
          role: 'admin',
        },
        recipientId,
      ),
    );

    const response = await request(app)
      .get('/api/users/lookup')
      .query({ email: '  RECIPIENT@example.com  ' })
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: recipientId,
        name: 'Recipient User',
        email: 'recipient@example.com',
      },
    });
    expect(Object.keys(response.body.user).sort()).toEqual([
      'email',
      'id',
      'name',
    ]);
    expect(User.findOne).toHaveBeenCalledWith({
      email: 'recipient@example.com',
      status: 'active',
      _id: { $ne: userId },
    });
    expect(User.findOne.mock.results.at(-1).value.select).toHaveBeenCalledWith(
      '_id name email',
    );
  });

  it('requires authentication for recipient lookup', async () => {
    const response = await request(app)
      .get('/api/users/lookup')
      .query({ email: 'recipient@example.com' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('returns a clear not-found response for nonexistent recipients', async () => {
    users.push(makeUser({ ...registration, passwordHash: 'owner-hash' }));

    const response = await request(app)
      .get('/api/users/lookup')
      .query({ email: 'missing@example.com' })
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'No active account found for that email',
    });
  });

  it('rejects malformed recipient lookup emails', async () => {
    users.push(makeUser({ ...registration, passwordHash: 'owner-hash' }));

    const response = await request(app)
      .get('/api/users/lookup')
      .query({ email: 'not-an-email' })
      .set('Authorization', `Bearer ${tokenFor(userId)}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Enter a valid email address' });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer tokens on /me', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
  });

  it('revokes the current session on logout but preserves another user session', async () => {
    const otherUserId = '64b000000000000000000002';
    const passwordHash = await bcrypt.hash(registration.password, 4);
    users.push(makeUser({ ...registration, passwordHash }));
    users.push(
      makeUser(
        {
          ...registration,
          email: 'other@example.com',
          passwordHash,
        },
        otherUserId,
      ),
    );

    const firstToken = tokenFor(userId);
    const otherToken = tokenFor(otherUserId);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${firstToken}`);
    const afterLogout = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${firstToken}`);
    const otherSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(logout.status).toBe(204);
    expect(afterLogout.status).toBe(401);
    expect(otherSession.status).toBe(200);
    expect(TokenRevocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        tokenIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(TokenRevocation.create.mock.calls)).not.toContain(
      firstToken,
    );
    expect(AuditLog.create).toHaveBeenCalledWith({
      actorUserId: userId,
      action: 'auth.logout',
      outcome: 'success',
    });
  });

  it('rejects expired access tokens', async () => {
    const expiredToken = jwt.sign({}, testSecret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'trustvault',
      audience: 'trustvault-api',
      expiresIn: -1,
      jwtid: 'a'.repeat(64),
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
    expect(TokenRevocation.exists).not.toHaveBeenCalled();
  });

  it('rejects validly signed tokens without the required token identifier', async () => {
    const malformedToken = jwt.sign({}, testSecret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'trustvault',
      audience: 'trustvault-api',
      expiresIn: '15m',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${malformedToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
    expect(TokenRevocation.exists).not.toHaveBeenCalled();
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('fails closed when the revocation store cannot be checked', async () => {
    const token = tokenFor(userId);
    TokenRevocation.exists.mockRejectedValueOnce(
      new Error('revocation database unavailable'),
    );
    users.push(makeUser({ ...registration, passwordHash: 'unused' }));

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('does not claim logout succeeded when revocation persistence fails', async () => {
    const token = tokenFor(userId);
    users.push(makeUser({ ...registration, passwordHash: 'unused' }));
    TokenRevocation.create.mockRejectedValueOnce(
      new Error('revocation database unavailable'),
    );

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    const stillValid = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(logout.status).toBe(500);
    expect(logout.body).toEqual({ error: 'Internal server error' });
    expect(stillValid.status).toBe(200);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });
});
