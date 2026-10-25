jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/PasswordResetToken', () => ({
  create: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

jest.mock('../models/TokenRevocation', () => ({
  exists: jest.fn(),
}));

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

jest.mock('../services/passwordResetEmail', () => ({
  isConfigured: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const TokenRevocation = require('../models/TokenRevocation');
const AuditLog = require('../models/AuditLog');
const passwordResetEmail = require('../services/passwordResetEmail');
const app = require('../app');

const userId = '64b000000000000000000001';
const secret = 'password-reset-test-secret-with-at-least-32-bytes';
const email = 'owner@example.com';
let user;
let tokens;
let deliveredToken;

function tokenHash(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
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
  process.env.FRONTEND_URL = 'https://trustvault.example';
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'TrustVault <no-reply@example.test>';
});

beforeEach(() => {
  mongoose.connection.readyState = 1;
  user = {
    _id: userId,
    name: 'Taylor User',
    email,
    passwordHash: 'old-password-hash',
    passwordVersion: 0,
    role: 'owner',
    status: 'active',
  };
  tokens = [];
  deliveredToken = null;
  jest.clearAllMocks();
  passwordResetEmail.isConfigured.mockReturnValue(true);
  passwordResetEmail.sendPasswordResetEmail.mockImplementation(async (_email, token) => {
    deliveredToken = token;
  });
  PasswordResetToken.deleteMany.mockImplementation(async ({ userId: targetId }) => {
    tokens = tokens.filter((entry) => entry.userId !== targetId);
  });
  PasswordResetToken.create.mockImplementation(async (record) => {
    tokens.push(record);
    return record;
  });
  PasswordResetToken.deleteOne.mockImplementation(async ({ tokenHash: hash }) => {
    tokens = tokens.filter((entry) => entry.tokenHash !== hash);
  });
  PasswordResetToken.findOneAndDelete.mockImplementation(async (query) => {
    const index = tokens.findIndex((entry) =>
      entry.tokenHash === query.tokenHash &&
      entry.expiresAt > query.expiresAt.$gt,
    );
    if (index < 0) return null;
    return tokens.splice(index, 1)[0];
  });
  User.findOne.mockImplementation(async ({ email: requestedEmail }) =>
    requestedEmail === email ? user : null,
  );
  User.findById.mockImplementation(async (id) => id === userId ? user : null);
  User.findByIdAndUpdate.mockImplementation(async (id, update) => {
    if (id !== userId) return null;
    Object.assign(user, update.$set);
    user.passwordVersion += update.$inc.passwordVersion;
    return user;
  });
  TokenRevocation.exists.mockResolvedValue(null);
  AuditLog.create.mockResolvedValue({});
});

describe('Password reset API', () => {
  it('returns the same generic response for known and unknown emails', async () => {
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.message).toMatch(/If an active account exists/);
    expect(JSON.stringify(known.body)).not.toContain(deliveredToken);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(tokenHash(deliveredToken));
    expect(tokens[0].tokenHash).not.toBe(deliveredToken);
    expect(passwordResetEmail.sendPasswordResetEmail).toHaveBeenCalledWith(email, deliveredToken);
    expect(AuditLog.create).toHaveBeenCalledWith({
      action: 'auth.password_reset.requested',
      accountStatus: null,
      outcome: 'success',
    });
  });

  it('does not create reset tokens or reveal accounts when email is not configured', async () => {
    passwordResetEmail.isConfigured.mockReturnValue(false);

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Password reset email is not configured' });
    expect(PasswordResetToken.create).not.toHaveBeenCalled();
    expect(passwordResetEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('removes an unusable token and returns a generic response if email delivery fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    passwordResetEmail.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP credentials must not be logged'));

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    expect(response.status).toBe(202);
    expect(response.body.message).toMatch(/If an active account exists/);
    expect(tokens).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith('Password reset email delivery failed');
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('SMTP credentials'));
    errorSpy.mockRestore();
  });

  it('rejects invalid email input without querying users', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request body' });
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('updates the password, consumes the token once, and invalidates existing access tokens', async () => {
    const oldAccessToken = accessToken();
    const requested = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    expect(requested.status).toBe(202);
    expect(deliveredToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: deliveredToken, password: 'AnotherStrongPassword123!' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password reset successfully' });
    expect(JSON.stringify(response.body)).not.toContain(deliveredToken);
    expect(tokens).toHaveLength(0);
    expect(user.passwordHash).not.toBe('AnotherStrongPassword123!');
    await expect(bcrypt.compare('AnotherStrongPassword123!', user.passwordHash)).resolves.toBe(true);
    expect(user.passwordVersion).toBe(1);
    expect(AuditLog.create).toHaveBeenCalledWith({
      actorUserId: user._id,
      action: 'auth.password_reset.completed',
      accountStatus: 'active',
      outcome: 'success',
    });

    const replay = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: deliveredToken, password: 'AnotherStrongPassword123!' });
    expect(replay.status).toBe(400);
    expect(replay.body).toEqual({ error: 'Invalid or expired password reset link' });

    const oldSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(oldSession.status).toBe(401);
  });

  it('rejects expired, malformed, and already-used reset tokens', async () => {
    const expiredToken = crypto.randomBytes(32).toString('base64url');
    tokens.push({
      userId,
      tokenHash: tokenHash(expiredToken),
      expiresAt: new Date(Date.now() - 1000),
    });

    const expired = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: expiredToken, password: 'AnotherStrongPassword123!' });
    const malformed = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-token', password: 'AnotherStrongPassword123!' });
    const invalidPassword = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: crypto.randomBytes(32).toString('base64url'), password: 'short' });

    expect(expired.status).toBe(400);
    expect(expired.body).toEqual({ error: 'Invalid or expired password reset link' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'Invalid request body' });
    expect(invalidPassword.status).toBe(400);
    expect(invalidPassword.body).toEqual({ error: 'Invalid request body' });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does not send email or create tokens for unknown and disabled accounts', async () => {
    user.status = 'disabled';
    const disabled = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'unknown@example.com' });

    expect(disabled.status).toBe(202);
    expect(disabled.body).toEqual(unknown.body);
    expect(passwordResetEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(PasswordResetToken.create).not.toHaveBeenCalled();
  });

  it('invalidates the previous reset link when a newer one is requested', async () => {
    const firstResponse = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    const firstToken = deliveredToken;
    const secondResponse = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(tokenHash(deliveredToken));
    expect(deliveredToken).not.toBe(firstToken);

    const oldLink = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: firstToken, password: 'AnotherStrongPassword123!' });
    expect(oldLink.status).toBe(400);
  });
});
