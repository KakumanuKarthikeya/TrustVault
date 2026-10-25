jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const TokenRevocation = require('../models/TokenRevocation');
const AuditLog = require('../models/AuditLog');
const app = require('../app');

const userId = '64b000000000000000000021';
const secret = 'change-password-test-secret-with-at-least-32-bytes';
const currentPassword = 'CurrentStrongPassword123!';
let user;

function queryFor(value) {
  return {
    select: jest.fn().mockResolvedValue(value),
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

function accessToken(version = 0) {
  return jwt.sign({ ver: version }, secret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'trustvault',
    audience: 'trustvault-api',
    expiresIn: '15m',
    jwtid: crypto.randomBytes(32).toString('hex'),
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = secret;
});

beforeEach(async () => {
  mongoose.connection.readyState = 1;
  user = {
    _id: userId,
    name: 'Taylor User',
    email: 'taylor@example.com',
    role: 'owner',
    status: 'active',
    passwordHash: await bcrypt.hash(currentPassword, 4),
    passwordVersion: 0,
  };
  jest.clearAllMocks();
  User.findById.mockImplementation(() => queryFor(user));
  User.findByIdAndUpdate.mockImplementation(async (filter, update) => {
    if (filter._id !== user._id || filter.passwordHash !== user.passwordHash) {
      return null;
    }
    user.passwordHash = update.$set.passwordHash;
    user.passwordVersion += update.$inc.passwordVersion;
    return user;
  });
  TokenRevocation.exists.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
});

describe('Change password API', () => {
  test('requires authentication', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword, newPassword: 'NewStrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('changes the password, returns a replacement session token, and invalidates prior sessions', async () => {
    const previousToken = accessToken();
    const newPassword = 'NewStrongPassword123!';
    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${previousToken}`)
      .send({ currentPassword, newPassword });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Password changed successfully');
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(user.passwordHash).not.toBe(newPassword);
    await expect(bcrypt.compare(newPassword, user.passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare(currentPassword, user.passwordHash)).resolves.toBe(false);
    expect(user.passwordVersion).toBe(1);
    expect(AuditLog.create).toHaveBeenCalledWith({
      actorUserId: user._id,
      action: 'auth.password.changed',
      accountStatus: 'active',
      outcome: 'success',
    });

    const oldSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${previousToken}`);
    const replacementSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.token}`);

    expect(oldSession.status).toBe(401);
    expect(replacementSession.status).toBe(200);
  });

  test('rejects an incorrect current password without changing the stored hash', async () => {
    const oldHash = user.passwordHash;
    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ currentPassword: 'WrongPassword123!', newPassword: 'NewStrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Current password is incorrect' });
    expect(user.passwordHash).toBe(oldHash);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects weak or unexpected input', async () => {
    const weakPassword = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ currentPassword, newPassword: 'short' });
    const unexpectedField = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ currentPassword, newPassword: 'NewStrongPassword123!', role: 'admin' });

    expect(weakPassword.status).toBe(400);
    expect(unexpectedField.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('does not allow reusing the current password', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ currentPassword, newPassword: currentPassword });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'New password must be different from the current password',
    });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
